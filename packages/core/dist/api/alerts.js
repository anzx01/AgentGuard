"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAlertsRouter = createAlertsRouter;
const express_1 = require("express");
const index_js_1 = require("../db/index.js");
const auditLogger_js_1 = require("../services/auditLogger.js");
function createAlertsRouter() {
    const router = (0, express_1.Router)();
    router.get('/', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const { status, severity, page = '1', pageSize = '20' } = req.query;
        const offset = (Number(page) - 1) * Number(pageSize);
        const conditions = [];
        const params = [];
        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (severity) {
            conditions.push('severity = ?');
            params.push(severity);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const total = db.prepare(`SELECT COUNT(*) as c FROM alert_events ${where}`).get(...params).c;
        const data = db.prepare(`SELECT * FROM alert_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset);
        res.json({ total, page: Number(page), pageSize: Number(pageSize), data });
    });
    router.post('/:id/acknowledge', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const { note } = req.body;
        const alert = db.prepare('SELECT id FROM alert_events WHERE id = ?').get(req.params.id);
        if (!alert)
            return res.status(404).json({ error: 'not_found' });
        db.prepare(`UPDATE alert_events SET status = 'acknowledged', acknowledged_at = datetime('now'), ack_note = ? WHERE id = ?`)
            .run(note ?? null, req.params.id);
        res.json(db.prepare('SELECT * FROM alert_events WHERE id = ?').get(req.params.id));
    });
    router.post('/batch-acknowledge', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const { ids } = req.body;
        if (!ids?.length)
            return res.status(400).json({ error: 'ids_required' });
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`UPDATE alert_events SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id IN (${placeholders})`).run(...ids);
        res.json({ acknowledged: ids.length });
    });
    // Alert channels
    router.get('/channels', (_req, res) => {
        const db = (0, index_js_1.getDb)();
        res.json({ channels: db.prepare('SELECT * FROM alert_channels ORDER BY created_at DESC').all() });
    });
    router.post('/channels', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const { name, type, config, min_severity = 'high', alert_types = [] } = req.body;
        if (!name || !type)
            return res.status(400).json({ error: 'name_and_type_required' });
        const id = `ch_${Date.now()}`;
        db.prepare(`INSERT INTO alert_channels (id, name, type, config, min_severity, alert_types) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(id, name, type, JSON.stringify(config ?? {}), min_severity, JSON.stringify(alert_types));
        (0, auditLogger_js_1.logConfigChange)({ action: 'create', resourceType: 'alert_channel', resourceId: id, after: req.body, ipAddress: req.ip });
        res.status(201).json(db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(id));
    });
    router.put('/channels/:id', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const before = db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(req.params.id);
        if (!before)
            return res.status(404).json({ error: 'not_found' });
        const { name, config, min_severity, alert_types, is_enabled } = req.body;
        db.prepare(`
      UPDATE alert_channels SET
        name = COALESCE(?, name),
        config = COALESCE(?, config),
        min_severity = COALESCE(?, min_severity),
        alert_types = COALESCE(?, alert_types),
        is_enabled = COALESCE(?, is_enabled)
      WHERE id = ?
    `).run(name ?? null, config ? JSON.stringify(config) : null, min_severity ?? null, alert_types ? JSON.stringify(alert_types) : null, is_enabled !== undefined ? (is_enabled ? 1 : 0) : null, req.params.id);
        (0, auditLogger_js_1.logConfigChange)({ action: 'update', resourceType: 'alert_channel', resourceId: req.params.id, before, after: req.body, ipAddress: req.ip });
        res.json(db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(req.params.id));
    });
    router.delete('/channels/:id', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const before = db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(req.params.id);
        if (!before)
            return res.status(404).json({ error: 'not_found' });
        db.prepare('DELETE FROM alert_channels WHERE id = ?').run(req.params.id);
        (0, auditLogger_js_1.logConfigChange)({ action: 'delete', resourceType: 'alert_channel', resourceId: req.params.id, before, ipAddress: req.ip });
        res.json({ message: '渠道已删除' });
    });
    return router;
}
//# sourceMappingURL=alerts.js.map