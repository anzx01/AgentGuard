"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogsRouter = createLogsRouter;
const express_1 = require("express");
const index_js_1 = require("../db/index.js");
const budgetManager_js_1 = require("../services/budgetManager.js");
function createLogsRouter() {
    const router = (0, express_1.Router)();
    router.get('/logs', (req, res) => {
        const db = (0, index_js_1.getDb)();
        const { page = '1', pageSize = '50', agentId, status, service, from, to, q } = req.query;
        const offset = (Number(page) - 1) * Number(pageSize);
        const conditions = [];
        const params = [];
        if (agentId) {
            conditions.push('t.agent_id = ?');
            params.push(agentId);
        }
        if (status) {
            conditions.push('t.decision = ?');
            params.push(status);
        }
        if (service) {
            conditions.push('t.target_service = ?');
            params.push(service);
        }
        if (from) {
            conditions.push('t.timestamp >= ?');
            params.push(from);
        }
        if (to) {
            conditions.push('t.timestamp <= ?');
            params.push(to);
        }
        if (q) {
            conditions.push('(t.target_url LIKE ? OR a.name LIKE ?)');
            params.push(`%${q}%`, `%${q}%`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const total = db.prepare(`
      SELECT COUNT(*) as c FROM transactions t
      LEFT JOIN agents a ON a.id = t.agent_id ${where}
    `).get(...params).c;
        const rows = db.prepare(`
      SELECT t.*, a.name as agent_name FROM transactions t
      LEFT JOIN agents a ON a.id = t.agent_id
      ${where}
      ORDER BY t.timestamp DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), offset);
        res.json({ total, page: Number(page), pageSize: Number(pageSize), data: rows });
    });
    router.get('/budget/summary', (_req, res) => {
        const db = (0, index_js_1.getDb)();
        const summary = (0, budgetManager_js_1.getGlobalSummary)();
        const agents = db.prepare(`SELECT id, name FROM agents WHERE status = 'active'`).all();
        const byAgent = agents.map(a => ({
            agentId: a.id,
            name: a.name,
            todaySpend: (0, budgetManager_js_1.getAgentDailySpend)(a.id),
            monthSpend: (0, budgetManager_js_1.getAgentMonthSpend)(a.id),
        }));
        res.json({ ...summary, byAgent });
    });
    return router;
}
//# sourceMappingURL=logs.js.map