"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRequest = logRequest;
exports.logConfigChange = logConfigChange;
exports.logSystemEvent = logSystemEvent;
const index_js_1 = require("../db/index.js");
const crypto_1 = __importDefault(require("crypto"));
// Async write queue
const queue = [];
let flushTimer = null;
const BATCH_SIZE = 500;
const FLUSH_INTERVAL_MS = 2000;
function logRequest(entry) {
    queue.push(entry);
    if (queue.length >= BATCH_SIZE) {
        flush();
    }
    else if (!flushTimer) {
        flushTimer = setTimeout(() => flush(), FLUSH_INTERVAL_MS);
    }
}
function flush() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (queue.length === 0)
        return;
    const batch = queue.splice(0, BATCH_SIZE);
    const db = (0, index_js_1.getDb)();
    const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (id, agent_id, method, target_url, target_service, request_headers,
       request_size, decision, blocked_rule_id, block_reason,
       response_status, response_size, latency_ms, proxy_latency_ms,
       estimated_cost, ip_address, is_streaming)
    VALUES
      (@id, @agentId, @method, @targetUrl, @targetService, @requestHeaders,
       @requestSize, @decision, @blockedRuleId, @blockReason,
       @responseStatus, @responseSize, @latencyMs, @proxyLatencyMs,
       @estimatedCost, @ipAddress, @isStreaming)
  `);
    const insertMany = db.transaction((rows) => {
        for (const r of rows) {
            insert.run({
                id: r.id,
                agentId: r.agentId,
                method: r.method,
                targetUrl: sanitizeUrl(r.targetUrl),
                targetService: r.targetService,
                requestHeaders: r.requestHeaders ? JSON.stringify(redactHeaders(r.requestHeaders)) : null,
                requestSize: r.requestSize ?? null,
                decision: r.decision,
                blockedRuleId: r.blockedRuleId ?? null,
                blockReason: r.blockReason ?? null,
                responseStatus: r.responseStatus ?? null,
                responseSize: r.responseSize ?? null,
                latencyMs: r.latencyMs ?? null,
                proxyLatencyMs: r.proxyLatencyMs ?? null,
                estimatedCost: r.estimatedCost ?? 0,
                ipAddress: r.ipAddress ?? null,
                isStreaming: r.isStreaming ? 1 : 0,
            });
        }
    });
    try {
        insertMany(batch);
    }
    catch (e) {
        console.error('[AuditLogger] flush error', e);
    }
}
function logConfigChange(params) {
    const db = (0, index_js_1.getDb)();
    const before = params.before ? JSON.stringify(params.before) : null;
    const after = params.after ? JSON.stringify(params.after) : null;
    const checksum = crypto_1.default
        .createHash('sha256')
        .update(`${new Date().toISOString()}${params.action}${params.resourceId ?? ''}${before ?? ''}${after ?? ''}`)
        .digest('hex');
    db.prepare(`
    INSERT INTO config_change_logs (id, action, resource_type, resource_id, before_value, after_value, ip_address, checksum)
    VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?)
  `).run(params.action, params.resourceType, params.resourceId ?? null, before, after, params.ipAddress ?? null, checksum);
}
function logSystemEvent(type, message, severity = 'info', details) {
    const db = (0, index_js_1.getDb)();
    db.prepare(`
    INSERT INTO system_events (id, type, severity, message, details)
    VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?)
  `).run(type, severity, message, details ? JSON.stringify(details) : null);
}
function redactHeaders(headers) {
    const result = {};
    for (const [k, v] of Object.entries(headers)) {
        const lower = k.toLowerCase();
        if (lower === 'authorization') {
            const parts = v.split(' ');
            result[k] = parts.length > 1 ? `${parts[0]} ***...***` : '***';
        }
        else {
            result[k] = v;
        }
    }
    return result;
}
function sanitizeUrl(url) {
    try {
        const u = new URL(url);
        u.searchParams.delete('api_key');
        u.searchParams.delete('apikey');
        u.searchParams.delete('key');
        u.searchParams.delete('secret');
        return u.toString();
    }
    catch {
        return url;
    }
}
// Graceful shutdown flush
process.on('exit', () => flush());
//# sourceMappingURL=auditLogger.js.map