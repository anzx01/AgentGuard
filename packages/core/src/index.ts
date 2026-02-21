import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import 'dotenv/config'
import { getDb } from './db/index.js'
import { loadKillSwitchState } from './services/killSwitch.js'
import { logSystemEvent } from './services/auditLogger.js'
import { createProxyRouter } from './proxy/proxyRouter.js'
import { createAuthRouter, requireAuth } from './api/auth.js'
import { createAgentsRouter } from './api/agents.js'
import { createRulesRouter } from './api/rules.js'
import { createLogsRouter } from './api/logs.js'
import { createKillSwitchRouter } from './api/killSwitch.js'
import { createAlertsRouter } from './api/alerts.js'
import { createSettingsRouter } from './api/settings.js'

// ── Bootstrap ──────────────────────────────────────────────
const API_PORT = Number(process.env.PORT ?? 3000)
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8080)
const BIND = process.env.BIND_ADDRESS ?? '127.0.0.1'

// Init DB
getDb()
loadKillSwitchState()
logSystemEvent('startup', `AgentGuard starting on proxy:${PROXY_PORT} api:${API_PORT}`)

// ── Management API server ──────────────────────────────────
const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/auth', createAuthRouter())

// Protected routes
const api = express.Router()
api.use(requireAuth)
api.use('/agents', createAgentsRouter())
api.use('/', createRulesRouter())
api.use('/', createLogsRouter())
api.use('/kill-switch', createKillSwitchRouter())
api.use('/alerts', createAlertsRouter())
api.use('/', createSettingsRouter())

app.use('/api', api)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

const apiServer = http.createServer(app)

// ── WebSocket for real-time events ─────────────────────────
const wss = new WebSocketServer({ server: apiServer, path: '/ws' })

export function broadcast(event: string, data: unknown) {
  const msg = JSON.stringify({ event, data, timestamp: new Date().toISOString() })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  })
}

wss.on('connection', (ws, req) => {
  // Simple token check via query param
  const url = new URL(req.url ?? '/', `http://localhost`)
  const token = url.searchParams.get('token')
  if (!token) { ws.close(1008, 'Unauthorized'); return }
  ws.send(JSON.stringify({ event: 'connected', data: { message: 'AgentGuard connected' } }))
})

apiServer.listen(API_PORT, BIND, () => {
  console.log(`[AgentGuard] Management API: http://${BIND}:${API_PORT}`)
})

// ── Proxy server ───────────────────────────────────────────
const proxyApp = express()
proxyApp.use(express.json())
proxyApp.use(express.urlencoded({ extended: true }))
proxyApp.use(createProxyRouter())

proxyApp.listen(PROXY_PORT, BIND, () => {
  console.log(`[AgentGuard] Proxy: http://${BIND}:${PROXY_PORT}`)
})

// ── Graceful shutdown ──────────────────────────────────────
process.on('SIGTERM', () => {
  logSystemEvent('shutdown', 'AgentGuard shutting down')
  process.exit(0)
})
