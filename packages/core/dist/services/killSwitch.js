"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadKillSwitchState = loadKillSwitchState;
exports.getKillSwitchState = getKillSwitchState;
exports.activateGlobal = activateGlobal;
exports.deactivateGlobal = deactivateGlobal;
exports.pauseAgent = pauseAgent;
exports.resumeAgent = resumeAgent;
exports.isBlocked = isBlocked;
const index_js_1 = require("../db/index.js");
const state = {
    global: { paused: false },
    agents: {},
};
function loadKillSwitchState() {
    const v = (0, index_js_1.getSetting)('kill_switch_active');
    state.global.paused = v === '1';
}
function getKillSwitchState() {
    return state;
}
function activateGlobal(reason, pausedBy = 'user') {
    state.global = { paused: true, pausedAt: new Date().toISOString(), pausedBy, reason };
    (0, index_js_1.setSetting)('kill_switch_active', '1');
}
function deactivateGlobal() {
    state.global = { paused: false };
    (0, index_js_1.setSetting)('kill_switch_active', '0');
}
function pauseAgent(agentId, pausedBy = 'user') {
    state.agents[agentId] = { paused: true, pausedAt: new Date().toISOString(), pausedBy };
}
function resumeAgent(agentId) {
    delete state.agents[agentId];
}
function isBlocked(agentId) {
    if (state.global.paused)
        return { blocked: true, reason: state.global.reason || 'Global kill switch active' };
    if (agentId && state.agents[agentId]?.paused)
        return { blocked: true, reason: 'Agent paused' };
    return { blocked: false };
}
//# sourceMappingURL=killSwitch.js.map