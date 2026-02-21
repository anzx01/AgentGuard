"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayKey = getTodayKey;
exports.getMonthKey = getMonthKey;
exports.getHourKey = getHourKey;
exports.recordTransaction = recordTransaction;
exports.getAgentDailySpend = getAgentDailySpend;
exports.getAgentMonthSpend = getAgentMonthSpend;
exports.getGlobalSummary = getGlobalSummary;
const index_js_1 = require("../db/index.js");
function getTodayKey() {
    return new Date().toISOString().slice(0, 10) + 'T00:00:00';
}
function getMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getHourKey() {
    const d = new Date();
    return `${d.toISOString().slice(0, 13)}:00:00`;
}
function recordTransaction(params) {
    const db = (0, index_js_1.getDb)();
    const hourKey = getHourKey();
    if (!params.agentId)
        return;
    db.prepare(`
    INSERT INTO budget_snapshots (id, agent_id, snapshot_hour, total_calls, allowed_calls, blocked_calls, total_cost)
    VALUES (lower(hex(randomblob(8))), ?, ?, 1, ?, ?, ?)
    ON CONFLICT(agent_id, snapshot_hour) DO UPDATE SET
      total_calls = total_calls + 1,
      allowed_calls = allowed_calls + excluded.allowed_calls,
      blocked_calls = blocked_calls + excluded.blocked_calls,
      total_cost = total_cost + excluded.total_cost
  `).run(params.agentId, hourKey, params.allowed ? 1 : 0, params.allowed ? 0 : 1, params.cost);
}
function getAgentDailySpend(agentId) {
    const db = (0, index_js_1.getDb)();
    const today = new Date().toISOString().slice(0, 10);
    const row = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as total
    FROM budget_snapshots
    WHERE agent_id = ? AND snapshot_hour LIKE ?
  `).get(agentId, `${today}%`);
    return row.total;
}
function getAgentMonthSpend(agentId) {
    const db = (0, index_js_1.getDb)();
    const month = getMonthKey();
    const row = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as total
    FROM budget_snapshots
    WHERE agent_id = ? AND snapshot_hour LIKE ?
  `).get(agentId, `${month}%`);
    return row.total;
}
function getGlobalSummary() {
    const db = (0, index_js_1.getDb)();
    const today = new Date().toISOString().slice(0, 10);
    const month = getMonthKey();
    const todayRow = db.prepare(`
    SELECT COALESCE(SUM(total_cost),0) as spend,
           COALESCE(SUM(total_calls),0) as calls,
           COALESCE(SUM(blocked_calls),0) as blocked
    FROM budget_snapshots WHERE snapshot_hour LIKE ?
  `).get(`${today}%`);
    const monthRow = db.prepare(`
    SELECT COALESCE(SUM(total_cost),0) as spend
    FROM budget_snapshots WHERE snapshot_hour LIKE ?
  `).get(`${month}%`);
    return {
        todaySpend: todayRow.spend,
        monthSpend: monthRow.spend,
        todayCalls: todayRow.calls,
        todayBlocked: todayRow.blocked,
    };
}
//# sourceMappingURL=budgetManager.js.map