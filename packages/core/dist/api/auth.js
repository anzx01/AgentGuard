"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRouter = createAuthRouter;
exports.requireAuth = requireAuth;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const index_js_1 = require("../db/index.js");
const auditLogger_js_1 = require("../services/auditLogger.js");
const loginAttempts = new Map();
function getJwtSecret() {
    let secret = (0, index_js_1.getSetting)('jwt_secret');
    if (!secret) {
        secret = crypto_1.default.randomBytes(32).toString('hex');
        (0, index_js_1.setSetting)('jwt_secret', secret);
    }
    return secret;
}
function createAuthRouter() {
    const router = (0, express_1.Router)();
    router.post('/login', async (req, res) => {
        const ip = req.ip ?? 'unknown';
        const attempt = loginAttempts.get(ip);
        if (attempt && attempt.lockedUntil > Date.now()) {
            return res.status(429).json({ error: 'too_many_attempts', message: '登录失败次数过多，请15分钟后重试' });
        }
        const { password } = req.body;
        if (!password)
            return res.status(400).json({ error: 'missing_password' });
        const storedHash = (0, index_js_1.getSetting)('dashboard_password_hash');
        if (!storedHash) {
            // First time setup: set password
            const hash = await bcryptjs_1.default.hash(password, 12);
            (0, index_js_1.setSetting)('dashboard_password_hash', hash);
            (0, index_js_1.setSetting)('setup_completed', '1');
            loginAttempts.delete(ip);
            const token = jsonwebtoken_1.default.sign({ sub: 'admin' }, getJwtSecret(), { expiresIn: '24h' });
            return res.json({ token, expiresAt: new Date(Date.now() + 86400_000).toISOString() });
        }
        const valid = await bcryptjs_1.default.compare(password, storedHash);
        if (!valid) {
            const cur = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
            cur.count++;
            if (cur.count >= 5)
                cur.lockedUntil = Date.now() + 15 * 60_000;
            loginAttempts.set(ip, cur);
            return res.status(401).json({ error: 'invalid_password', message: '密码错误' });
        }
        loginAttempts.delete(ip);
        const timeoutMin = Number((0, index_js_1.getSetting)('session_timeout_minutes') ?? 30);
        const token = jsonwebtoken_1.default.sign({ sub: 'admin' }, getJwtSecret(), { expiresIn: `${timeoutMin}m` });
        (0, auditLogger_js_1.logConfigChange)({ action: 'login', resourceType: 'session', ipAddress: ip });
        res.json({ token, expiresAt: new Date(Date.now() + timeoutMin * 60_000).toISOString() });
    });
    router.post('/logout', (req, res) => {
        (0, auditLogger_js_1.logConfigChange)({ action: 'logout', resourceType: 'session', ipAddress: req.ip });
        res.json({ message: '已退出' });
    });
    router.get('/status', (req, res) => {
        const setupDone = (0, index_js_1.getSetting)('setup_completed') === '1';
        res.json({ setupCompleted: setupDone });
    });
    router.post('/change-password', async (req, res) => {
        const { current, next } = req.body;
        if (!current || !next)
            return res.status(400).json({ error: 'missing_fields' });
        const storedHash = (0, index_js_1.getSetting)('dashboard_password_hash');
        if (!storedHash)
            return res.status(400).json({ error: 'no_password_set' });
        const valid = await bcryptjs_1.default.compare(current, storedHash);
        if (!valid)
            return res.status(401).json({ error: 'invalid_current_password', message: '当前密码错误' });
        const hash = await bcryptjs_1.default.hash(next, 12);
        (0, index_js_1.setSetting)('dashboard_password_hash', hash);
        (0, auditLogger_js_1.logConfigChange)({ action: 'change_password', resourceType: 'session', ipAddress: req.ip });
        res.json({ message: '密码已更新' });
    });
    return router;
}
function requireAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    const token = header.slice(7);
    try {
        jsonwebtoken_1.default.verify(token, getJwtSecret());
        next();
    }
    catch {
        res.status(401).json({ error: 'token_expired' });
    }
}
//# sourceMappingURL=auth.js.map