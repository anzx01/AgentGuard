"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKillSwitchRouter = createKillSwitchRouter;
const express_1 = require("express");
const killSwitch_js_1 = require("../services/killSwitch.js");
const auditLogger_js_1 = require("../services/auditLogger.js");
const alertManager_js_1 = require("../services/alertManager.js");
function createKillSwitchRouter() {
    const router = (0, express_1.Router)();
    router.get('/status', (_req, res) => {
        res.json((0, killSwitch_js_1.getKillSwitchState)());
    });
    router.post('/activate', (req, res) => {
        const { reason = '手动触发', scope = 'global', agentId } = req.body;
        if (scope === 'agent' && agentId) {
            (0, killSwitch_js_1.pauseAgent)(agentId, 'user');
            (0, auditLogger_js_1.logConfigChange)({ action: 'kill_switch_agent_on', resourceType: 'kill_switch', resourceId: agentId, ipAddress: req.ip });
            (0, alertManager_js_1.createAlert)({ agentId, severity: 'high', type: 'system.kill_switch.on', title: 'Agent Kill Switch 已激活', message: `Agent ${agentId} 已暂停：${reason}` });
        }
        else {
            (0, killSwitch_js_1.activateGlobal)(reason, 'user');
            (0, auditLogger_js_1.logConfigChange)({ action: 'kill_switch_global_on', resourceType: 'kill_switch', ipAddress: req.ip });
            (0, alertManager_js_1.createAlert)({ severity: 'critical', type: 'system.kill_switch.on', title: '全局 Kill Switch 已激活', message: reason });
        }
        res.json({ status: 'activated', scope, reason, activatedAt: new Date().toISOString() });
    });
    router.post('/deactivate', (req, res) => {
        const { scope = 'global', agentId } = req.body;
        if (scope === 'agent' && agentId) {
            (0, killSwitch_js_1.resumeAgent)(agentId);
            (0, auditLogger_js_1.logConfigChange)({ action: 'kill_switch_agent_off', resourceType: 'kill_switch', resourceId: agentId, ipAddress: req.ip });
        }
        else {
            (0, killSwitch_js_1.deactivateGlobal)();
            (0, auditLogger_js_1.logConfigChange)({ action: 'kill_switch_global_off', resourceType: 'kill_switch', ipAddress: req.ip });
            (0, alertManager_js_1.createAlert)({ severity: 'info', type: 'system.kill_switch.off', title: '全局 Kill Switch 已解除', message: '系统已恢复正常运行' });
        }
        res.json({ status: 'deactivated', scope, deactivatedAt: new Date().toISOString() });
    });
    return router;
}
//# sourceMappingURL=killSwitch.js.map