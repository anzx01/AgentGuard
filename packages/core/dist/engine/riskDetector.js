"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordFailure = recordFailure;
exports.resetFailures = resetFailures;
exports.getConsecutiveFailures = getConsecutiveFailures;
exports.detectRisk = detectRisk;
const index_js_1 = require("../db/index.js");
// Track consecutive failures per agent (in-memory)
const consecutiveFailures = new Map();
function recordFailure(agentId) {
    const count = (consecutiveFailures.get(agentId) ?? 0) + 1;
    consecutiveFailures.set(agentId, count);
    return count;
}
function resetFailures(agentId) {
    consecutiveFailures.delete(agentId);
}
function getConsecutiveFailures(agentId) {
    return consecutiveFailures.get(agentId) ?? 0;
}
function detectRisk(params) {
    const db = (0, index_js_1.getDb)();
    // 1. Unknown domain check
    const host = extractHost(params.targetUrl);
    const alias = db
        .prepare('SELECT id FROM service_aliases WHERE alias = ? AND is_enabled = 1')
        .get(params.targetService);
    if (!alias) {
        // Check if domain matches any known alias target
        const knownAlias = db
            .prepare("SELECT id FROM service_aliases WHERE target_url LIKE ? AND is_enabled = 1")
            .get(`%${host}%`);
        if (!knownAlias) {
            return { risky: true, reason: `访问未知域名 ${host}`, severity: 'medium' };
        }
    }
    // 2. Amount spike detection (compare to 7-day average)
    if (params.estimatedAmount > 0) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const avgRow = db
            .prepare(`
        SELECT AVG(total_cost / NULLIF(allowed_calls, 0)) as avg_cost
        FROM budget_snapshots
        WHERE agent_id = ? AND snapshot_hour >= ?
      `)
            .get(params.agentId, sevenDaysAgo);
        const avg = avgRow.avg_cost ?? 0;
        if (avg > 0 && params.estimatedAmount > avg * 5) {
            return {
                risky: true,
                reason: `单笔金额 $${params.estimatedAmount.toFixed(2)} 超过7日均值 $${avg.toFixed(2)} 的5倍`,
                severity: 'high',
            };
        }
    }
    // 3. Late-night large amount
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 6 && params.estimatedAmount > 10) {
        return {
            risky: true,
            reason: `深夜时段（${hour}:00）发生大额操作 $${params.estimatedAmount.toFixed(2)}`,
            severity: 'medium',
        };
    }
    // 4. Consecutive failures
    const failures = getConsecutiveFailures(params.agentId);
    if (failures >= 5) {
        return {
            risky: true,
            reason: `Agent 连续 ${failures} 次请求被阻断`,
            severity: 'high',
        };
    }
    return { risky: false };
}
function extractHost(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return url;
    }
}
//# sourceMappingURL=riskDetector.js.map