"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcast = broadcast;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const http_1 = __importDefault(require("http"));
require("dotenv/config");
const index_js_1 = require("./db/index.js");
const killSwitch_js_1 = require("./services/killSwitch.js");
const auditLogger_js_1 = require("./services/auditLogger.js");
const proxyRouter_js_1 = require("./proxy/proxyRouter.js");
const auth_js_1 = require("./api/auth.js");
const agents_js_1 = require("./api/agents.js");
const rules_js_1 = require("./api/rules.js");
const logs_js_1 = require("./api/logs.js");
const killSwitch_js_2 = require("./api/killSwitch.js");
const alerts_js_1 = require("./api/alerts.js");
const settings_js_1 = require("./api/settings.js");
// ── Bootstrap ──────────────────────────────────────────────
const API_PORT = Number(process.env.PORT ?? 3000);
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8080);
const BIND = process.env.BIND_ADDRESS ?? '127.0.0.1';
// Init DB
(0, index_js_1.getDb)();
(0, killSwitch_js_1.loadKillSwitchState)();
(0, auditLogger_js_1.logSystemEvent)('startup', `AgentGuard starting on proxy:${PROXY_PORT} api:${API_PORT}`);
// ── Management API server ──────────────────────────────────
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api/auth', (0, auth_js_1.createAuthRouter)());
// Protected routes
const api = express_1.default.Router();
api.use(auth_js_1.requireAuth);
api.use('/agents', (0, agents_js_1.createAgentsRouter)());
api.use('/', (0, rules_js_1.createRulesRouter)());
api.use('/', (0, logs_js_1.createLogsRouter)());
api.use('/kill-switch', (0, killSwitch_js_2.createKillSwitchRouter)());
api.use('/alerts', (0, alerts_js_1.createAlertsRouter)());
api.use('/', (0, settings_js_1.createSettingsRouter)());
app.use('/api', api);
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
const apiServer = http_1.default.createServer(app);
// ── WebSocket for real-time events ─────────────────────────
const wss = new ws_1.WebSocketServer({ server: apiServer, path: '/ws' });
function broadcast(event, data) {
    const msg = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN)
            client.send(msg);
    });
}
wss.on('connection', (ws, req) => {
    // Simple token check via query param
    const url = new URL(req.url ?? '/', `http://localhost`);
    const token = url.searchParams.get('token');
    if (!token) {
        ws.close(1008, 'Unauthorized');
        return;
    }
    ws.send(JSON.stringify({ event: 'connected', data: { message: 'AgentGuard connected' } }));
});
apiServer.listen(API_PORT, BIND, () => {
    console.log(`[AgentGuard] Management API: http://${BIND}:${API_PORT}`);
});
// ── Proxy server ───────────────────────────────────────────
const proxyApp = (0, express_1.default)();
proxyApp.use(express_1.default.json());
proxyApp.use(express_1.default.urlencoded({ extended: true }));
proxyApp.use((0, proxyRouter_js_1.createProxyRouter)());
proxyApp.listen(PROXY_PORT, BIND, () => {
    console.log(`[AgentGuard] Proxy: http://${BIND}:${PROXY_PORT}`);
});
// ── Graceful shutdown ──────────────────────────────────────
process.on('SIGTERM', () => {
    (0, auditLogger_js_1.logSystemEvent)('shutdown', 'AgentGuard shutting down');
    process.exit(0);
});
//# sourceMappingURL=index.js.map