"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProxyRouter = createProxyRouter;
const express_1 = __importDefault(require("express"));
const http_proxy_middleware_1 = require("http-proxy-middleware");
const index_js_1 = require("../db/index.js");
const killSwitch_js_1 = require("../services/killSwitch.js");
const ruleEngine_js_1 = require("../engine/ruleEngine.js");
const riskDetector_js_1 = require("../engine/riskDetector.js");
const budgetManager_js_1 = require("../services/budgetManager.js");
const auditLogger_js_1 = require("../services/auditLogger.js");
const alertManager_js_1 = require("../services/alertManager.js");
const crypto_1 = __importDefault(require("crypto"));
function createProxyRouter() {
    const router = express_1.default.Router();
    // Route: /proxy/:alias/*
    router.use('/proxy/:alias', async (req, res, next) => {
        const start = Date.now();
        const alias = req.params.alias;
        const db = (0, index_js_1.getDb)();
        // 1. Resolve service alias
        const serviceRow = db
            .prepare('SELECT target_url FROM service_aliases WHERE alias = ? AND is_enabled = 1')
            .get(alias);
        if (!serviceRow) {
            return res.status(404).json({ error: 'unknown_service', message: `服务别名 "${alias}" 未注册` });
        }
        const targetBase = serviceRow.target_url;
        const restPath = req.path; // already stripped of /proxy/:alias by express
        const targetUrl = `${targetBase}${restPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;
        // 2. Resolve Agent identity
        const tokenHeader = req.headers['x-agentguard-token'] ||
            req.headers['authorization']?.replace(/^Bearer\s+/i, '');
        let agentId = null;
        if (tokenHeader) {
            const tokenHash = crypto_1.default.createHash('sha256').update(tokenHeader).digest('hex');
            const tokenRow = db
                .prepare(`SELECT agent_id FROM agent_tokens WHERE token_hash = ? AND is_active = 1`)
                .get(tokenHash);
            if (tokenRow) {
                agentId = tokenRow.agent_id;
                // Update last_seen
                db.prepare(`UPDATE agents SET last_seen_at = datetime('now') WHERE id = ?`).run(agentId);
                db.prepare(`UPDATE agent_tokens SET last_used_at = datetime('now') WHERE token_hash = ?`).run(tokenHash);
            }
        }
        else {
            // No token: use default agent if only one exists
            const agents = db.prepare(`SELECT id FROM agents WHERE status = 'active' LIMIT 2`).all();
            if (agents.length === 1)
                agentId = agents[0].id;
        }
        if (!agentId) {
            return res.status(401).json({ error: 'unauthorized', message: '无效的 Agent Token' });
        }
        // 3. Kill Switch check
        const killCheck = (0, killSwitch_js_1.isBlocked)(agentId);
        if (killCheck.blocked) {
            await writeBlockedLog({ agentId, req, targetUrl, alias, reason: killCheck.reason, start });
            return res.status(503).json({ error: 'service_paused', message: killCheck.reason });
        }
        // 4. Estimate amount from request body
        const estimatedAmount = extractAmount(req.body, alias, req.path);
        // 5. Rule Engine
        const ruleDecision = (0, ruleEngine_js_1.evaluateRules)({
            agentId,
            targetUrl,
            targetService: alias,
            method: req.method,
            estimatedAmount,
        });
        if (!ruleDecision.allowed) {
            (0, riskDetector_js_1.recordFailure)(agentId);
            await writeBlockedLog({ agentId, req, targetUrl, alias, reason: ruleDecision.reason, ruleId: ruleDecision.ruleId, start });
            (0, alertManager_js_1.createAlert)({
                agentId,
                severity: 'high',
                type: 'rule_blocked',
                title: '请求被规则阻断',
                message: ruleDecision.reason,
            });
            return res.status(403).json({ error: 'rule_blocked', message: ruleDecision.reason });
        }
        // 6. Risk Detection
        const riskResult = (0, riskDetector_js_1.detectRisk)({ agentId, targetUrl, targetService: alias, estimatedAmount, method: req.method });
        if (riskResult.risky) {
            (0, riskDetector_js_1.recordFailure)(agentId);
            await writeBlockedLog({ agentId, req, targetUrl, alias, reason: riskResult.reason, start });
            (0, alertManager_js_1.createAlert)({
                agentId,
                severity: riskResult.severity ?? 'medium',
                type: 'risk_detected',
                title: '风险检测触发',
                message: riskResult.reason,
            });
            return res.status(403).json({ error: 'risk_detected', message: riskResult.reason });
        }
        // 7. Forward request
        (0, riskDetector_js_1.resetFailures)(agentId);
        const proxyStart = Date.now();
        // Use http-proxy-middleware dynamically
        const proxy = (0, http_proxy_middleware_1.createProxyMiddleware)({
            target: targetBase,
            changeOrigin: true,
            pathRewrite: { [`^/proxy/${alias}`]: '' },
            on: {
                proxyRes: (proxyRes, proxyReq, originalReq) => {
                    const latencyMs = Date.now() - start;
                    const proxyLatencyMs = Date.now() - proxyStart;
                    const expressReq = originalReq;
                    (0, budgetManager_js_1.recordTransaction)({
                        agentId: expressReq._agentId ?? agentId,
                        cost: expressReq._estimatedAmount ?? estimatedAmount,
                        allowed: true,
                    });
                    (0, auditLogger_js_1.logRequest)({
                        id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        agentId,
                        method: req.method,
                        targetUrl,
                        targetService: alias,
                        requestHeaders: req.headers,
                        requestSize: Number(req.headers['content-length'] ?? 0),
                        decision: 'allow',
                        responseStatus: proxyRes.statusCode,
                        latencyMs,
                        proxyLatencyMs,
                        estimatedCost: estimatedAmount,
                        ipAddress: req.ip,
                    });
                },
                error: (err, proxyReq, proxyRes) => {
                    const latencyMs = Date.now() - start;
                    (0, auditLogger_js_1.logRequest)({
                        id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        agentId,
                        method: req.method,
                        targetUrl,
                        targetService: alias,
                        decision: 'error',
                        blockReason: err.message,
                        latencyMs,
                        ipAddress: req.ip,
                    });
                },
            },
        });
        req._agentId = agentId;
        req._estimatedAmount = estimatedAmount;
        proxy(req, res, next);
    });
    return router;
}
async function writeBlockedLog(params) {
    (0, auditLogger_js_1.logRequest)({
        id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        agentId: params.agentId,
        method: params.req.method,
        targetUrl: params.targetUrl,
        targetService: params.alias,
        requestHeaders: params.req.headers,
        decision: 'block',
        blockedRuleId: params.ruleId,
        blockReason: params.reason,
        latencyMs: Date.now() - params.start,
        ipAddress: params.req.ip,
    });
}
function extractAmount(body, alias, path) {
    if (!body || typeof body !== 'object')
        return 0;
    const b = body;
    // Stripe: amount is in cents
    if (alias === 'stripe' && (path.includes('/charges') || path.includes('/payment_intents'))) {
        const raw = Number(b['amount'] ?? 0);
        return raw > 0 ? raw / 100 : 0;
    }
    // OpenAI: estimate from max_tokens
    if (alias === 'openai' && path.includes('/chat/completions')) {
        const maxTokens = Number(b['max_tokens'] ?? 1000);
        return (maxTokens / 1000) * 0.002; // rough estimate
    }
    return 0;
}
//# sourceMappingURL=proxyRouter.js.map