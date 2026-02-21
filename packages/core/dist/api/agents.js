"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentsRouter = createAgentsRouter;
const express_1 = require("express");
const index_js_1 = require("../db/index.js");
const auditLogger_js_1 = require("../services/auditLogger.js");
const killSwitch_js_1 = require("../services/killSwitch.js");
const crypto_1 = __importDefault(require("crypto"));
function genId() {
    return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function genToken(agentId) {
    const raw = `ag_live_${agentId}_${crypto_1.default.randomBytes(16).toString('hex')}`;
    const hash = crypto_1.default.createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 16);
    return { raw, hash, prefix };
}
function createAgentsRouter() {
    const router = (0, express_1.Router)();
    router.get('/', (_req, res) => {
        const db = (0, index_js_1.getDb)();
        const agents = db.prepare(`
      SELECT a.id, a.name, a.description, a.status, a.created_at, a.last_seen_at,
             at.token_prefix
      FROM agents a
      LEFT JOIN agent_tokens at ON at.agent_id = a.id AND at.is_active = 1
      ORDER BY a.created_at DESC
    `).all();
        res.json({ agents });
    });
    router.post('/', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const { name, description } = req.body;
        if (!name)
            return res.status(400).json({ error: 'name_required' });
        // Check Free tier limit
        const tier = db.prepare(`SELECT value FROM settings WHERE key = 'license_tier'`).get();
        const maxAgents = (tier?.value === 'pro') ? 10 : 1;
        const count = db.prepare('SELECT COUNT(*) as c FROM agents').get().c;
        if (count >= maxAgents) {
            return res.status(403).json({ error: 'agent_limit', message: `当前套餐最多支持 ${maxAgents} 个 Agent` });
        }
        const id = genId();
        // Create default rule set for this agent
        const ruleSetId = `rs_${Date.now()}`;
        db.prepare(`INSERT INTO rule_sets (id, name) VALUES (?, ?)`).run(ruleSetId, `${name} 规则集`);
        db.prepare(`INSERT INTO agents (id, name, description, rule_set_id) VALUES (?, ?, ?, ?)`).run(id, name, description ?? null, ruleSetId);
        const token = genToken(id);
        db.prepare(`INSERT INTO agent_tokens (id, agent_id, token_hash, token_prefix) VALUES (?, ?, ?, ?)`).run(`tok_${Date.now()}`, id, token.hash, token.prefix);
        (0, auditLogger_js_1.logConfigChange)({ action: 'create', resourceType: 'agent', resourceId: id, after: { name, description }, ipAddress: req.ip });
        res.status(201).json({ id, name, token: token.raw, note: 'Token 仅显示一次，请立即保存' });
    });
    router.get('/:id', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const agent = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(req.params.id);
        if (!agent)
            return res.status(404).json({ error: 'not_found' });
        const rules = db.prepare(`
      SELECT r.* FROM rules r
      JOIN rule_sets rs ON rs.id = r.rule_set_id
      JOIN agents a ON a.rule_set_id = rs.id
      WHERE a.id = ?
    `).all(req.params.id);
        res.json({ agent, rules });
    });
    router.put('/:id', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const { name, description } = req.body;
        const before = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
        if (!before)
            return res.status(404).json({ error: 'not_found' });
        db.prepare(`UPDATE agents SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = datetime('now') WHERE id = ?`)
            .run(name ?? null, description ?? null, req.params.id);
        (0, auditLogger_js_1.logConfigChange)({ action: 'update', resourceType: 'agent', resourceId: req.params.id, before, after: req.body, ipAddress: req.ip });
        res.json(db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id));
    });
    router.delete('/:id', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const before = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
        if (!before)
            return res.status(404).json({ error: 'not_found' });
        db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
        (0, auditLogger_js_1.logConfigChange)({ action: 'delete', resourceType: 'agent', resourceId: req.params.id, before, ipAddress: req.ip });
        res.json({ message: 'Agent 已删除' });
    });
    router.post('/:id/pause', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
        if (!agent)
            return res.status(404).json({ error: 'not_found' });
        db.prepare(`UPDATE agents SET status = 'paused', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
        (0, killSwitch_js_1.pauseAgent)(req.params.id, 'user');
        (0, auditLogger_js_1.logConfigChange)({ action: 'pause', resourceType: 'agent', resourceId: req.params.id, ipAddress: req.ip });
        res.json({ id: req.params.id, status: 'paused', pausedAt: new Date().toISOString() });
    });
    router.post('/:id/resume', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
        if (!agent)
            return res.status(404).json({ error: 'not_found' });
        db.prepare(`UPDATE agents SET status = 'active', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
        (0, killSwitch_js_1.resumeAgent)(req.params.id);
        (0, auditLogger_js_1.logConfigChange)({ action: 'resume', resourceType: 'agent', resourceId: req.params.id, ipAddress: req.ip });
        res.json({ id: req.params.id, status: 'active', resumedAt: new Date().toISOString() });
    });
    router.post('/:id/rotate-token', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
        if (!agent)
            return res.status(404).json({ error: 'not_found' });
        // Deactivate old tokens
        db.prepare(`UPDATE agent_tokens SET is_active = 0 WHERE agent_id = ?`).run(req.params.id);
        const token = genToken(req.params.id);
        db.prepare(`INSERT INTO agent_tokens (id, agent_id, token_hash, token_prefix) VALUES (?, ?, ?, ?)`).run(`tok_${Date.now()}`, req.params.id, token.hash, token.prefix);
        (0, auditLogger_js_1.logConfigChange)({ action: 'rotate_token', resourceType: 'agent', resourceId: req.params.id, ipAddress: req.ip });
        res.json({ token: token.raw, note: 'Token 仅显示一次，请立即保存' });
    });
    return router;
}
//# sourceMappingURL=agents.js.map