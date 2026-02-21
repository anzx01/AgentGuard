"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettingsRouter = createSettingsRouter;
const express_1 = require("express");
const index_js_1 = require("../db/index.js");
const index_js_2 = require("../db/index.js");
const auditLogger_js_1 = require("../services/auditLogger.js");
function createSettingsRouter() {
    const router = (0, express_1.Router)();
    // Service aliases
    router.get('/service-aliases', (_req, res) => {
        const db = (0, index_js_1.getDb)();
        res.json({ aliases: db.prepare('SELECT * FROM service_aliases ORDER BY is_builtin DESC, alias ASC').all() });
    });
    router.post('/service-aliases', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const { alias, target_url, description } = req.body;
        if (!alias || !target_url)
            return res.status(400).json({ error: 'alias_and_target_url_required' });
        const id = `alias_${Date.now()}`;
        db.prepare(`INSERT INTO service_aliases (id, alias, target_url, description) VALUES (?, ?, ?, ?)`)
            .run(id, alias, target_url, description ?? null);
        (0, auditLogger_js_1.logConfigChange)({ action: 'create', resourceType: 'service_alias', resourceId: id, after: req.body, ipAddress: req.ip });
        res.status(201).json(db.prepare('SELECT * FROM service_aliases WHERE id = ?').get(id));
    });
    router.put('/service-aliases/:id', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const row = db.prepare('SELECT * FROM service_aliases WHERE id = ?').get(req.params.id);
        if (!row)
            return res.status(404).json({ error: 'not_found' });
        const { alias, target_url, description, is_enabled } = req.body;
        db.prepare(`
      UPDATE service_aliases SET
        alias = COALESCE(?, alias),
        target_url = COALESCE(?, target_url),
        description = COALESCE(?, description),
        is_enabled = COALESCE(?, is_enabled)
      WHERE id = ?
    `).run(alias ?? null, target_url ?? null, description ?? null, is_enabled !== undefined ? (is_enabled ? 1 : 0) : null, req.params.id);
        (0, auditLogger_js_1.logConfigChange)({ action: 'update', resourceType: 'service_alias', resourceId: req.params.id, before: row, after: req.body, ipAddress: req.ip });
        res.json(db.prepare('SELECT * FROM service_aliases WHERE id = ?').get(req.params.id));
    });
    router.delete('/service-aliases/:id', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const row = db.prepare('SELECT * FROM service_aliases WHERE id = ?').get(req.params.id);
        if (!row)
            return res.status(404).json({ error: 'not_found' });
        if (row.is_builtin)
            return res.status(403).json({ error: 'cannot_delete_builtin' });
        db.prepare('DELETE FROM service_aliases WHERE id = ?').run(req.params.id);
        (0, auditLogger_js_1.logConfigChange)({ action: 'delete', resourceType: 'service_alias', resourceId: req.params.id, before: row, ipAddress: req.ip });
        res.json({ message: '别名已删除' });
    });
    // System settings
    router.get('/settings', (_req, res) => {
        const db = (0, index_js_1.getDb)();
        const rows = db.prepare('SELECT key, value FROM settings WHERE is_encrypted = 0').all();
        const result = {};
        for (const r of rows)
            result[r.key] = r.value;
        res.json(result);
    });
    router.put('/settings', (req, res) => {
        const allowed = [
            'proxy_port', 'api_port', 'bind_address', 'proxy_ip_allowlist',
            'session_timeout_minutes', 'log_retention_days', 'alert_retention_days',
            'auto_backup_enabled', 'auto_backup_interval', 'auto_backup_keep', 'backup_path',
        ];
        const updates = req.body;
        for (const [k, v] of Object.entries(updates)) {
            if (allowed.includes(k))
                (0, index_js_2.setSetting)(k, String(v));
        }
        (0, auditLogger_js_1.logConfigChange)({ action: 'update', resourceType: 'settings', after: updates, ipAddress: req.ip });
        res.json({ message: '设置已保存' });
    });
    // License
    router.post('/license/activate', async (req, res) => {
        const { key } = req.body;
        if (!key)
            return res.status(400).json({ error: 'key_required' });
        // In production, call license server. For now, accept any AG-XXXX-XXXX-XXXX-XXXX format
        const valid = /^AG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.toUpperCase());
        if (!valid)
            return res.status(400).json({ error: 'invalid_key_format' });
        (0, index_js_2.setSetting)('license_tier', 'pro');
        (0, index_js_2.setSetting)('license_key', key);
        (0, index_js_2.setSetting)('license_activated_at', new Date().toISOString());
        (0, auditLogger_js_1.logConfigChange)({ action: 'license_activate', resourceType: 'license', ipAddress: req.ip });
        res.json({ plan: 'pro', message: 'Pro 版本已激活' });
    });
    router.get('/license', (_req, res) => {
        const tier = (0, index_js_2.getSetting)('license_tier') ?? 'free';
        const activatedAt = (0, index_js_2.getSetting)('license_activated_at');
        res.json({ tier, activatedAt });
    });
    // Danger zone
    router.post('/settings/clear-logs', (req, res) => {
        const db = (0, index_js_1.getDb)();
        db.prepare('DELETE FROM transactions').run();
        (0, auditLogger_js_1.logConfigChange)({ action: 'clear_logs', resourceType: 'settings', ipAddress: req.ip });
        res.json({ message: '日志已清空' });
    });
    router.post('/settings/reset-rules', (req, res) => {
        const db = (0, index_js_1.getDb)();
        db.prepare('DELETE FROM rules').run();
        (0, auditLogger_js_1.logConfigChange)({ action: 'reset_rules', resourceType: 'settings', ipAddress: req.ip });
        res.json({ message: '规则已重置' });
    });
    return router;
}
//# sourceMappingURL=settings.js.map