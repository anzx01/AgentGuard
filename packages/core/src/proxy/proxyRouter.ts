import express, { Request, Response, NextFunction } from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { getDb } from '../db/index.js'
import { isBlocked } from '../services/killSwitch.js'
import { evaluateRules } from '../engine/ruleEngine.js'
import { detectRisk, recordFailure, resetFailures } from '../engine/riskDetector.js'
import { recordTransaction } from '../services/budgetManager.js'
import { logRequest } from '../services/auditLogger.js'
import { createAlert } from '../services/alertManager.js'
import crypto from 'crypto'

export function createProxyRouter() {
  const router = express.Router()

  // Route: /proxy/:alias/*
  router.use('/proxy/:alias', async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    const alias = req.params.alias
    const db = getDb()

    // 1. Resolve service alias
    const serviceRow = db
      .prepare('SELECT target_url FROM service_aliases WHERE alias = ? AND is_enabled = 1')
      .get(alias) as { target_url: string } | undefined

    if (!serviceRow) {
      return res.status(404).json({ error: 'unknown_service', message: `服务别名 "${alias}" 未注册` })
    }

    const targetBase = serviceRow.target_url
    const restPath = req.path // already stripped of /proxy/:alias by express
    const targetUrl = `${targetBase}${restPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`

    // 2. Resolve Agent identity
    // Support two modes:
    //   a) X-AgentGuard-Token header (explicit)
    //   b) Authorization: Bearer ag_live_xxx  (OpenClaw / SDK-friendly mode)
    const xToken = req.headers['x-agentguard-token'] as string | undefined
    const authHeader = req.headers['authorization'] as string | undefined
    const authBearer = authHeader?.replace(/^Bearer\s+/i, '')
    // Treat Authorization bearer as AgentGuard token only when it looks like one
    const isAuthAgToken = authBearer?.startsWith('ag_live_') ?? false
    const tokenHeader = xToken || (isAuthAgToken ? authBearer : undefined)

    let agentId: string | null = null
    let upstreamApiKey: string | null = null

    if (tokenHeader) {
      const tokenHash = crypto.createHash('sha256').update(tokenHeader).digest('hex')
      const tokenRow = db
        .prepare(`SELECT at.agent_id, a.upstream_api_key
                  FROM agent_tokens at
                  JOIN agents a ON a.id = at.agent_id
                  WHERE at.token_hash = ? AND at.is_active = 1`)
        .get(tokenHash) as { agent_id: string; upstream_api_key: string | null } | undefined

      if (tokenRow) {
        agentId = tokenRow.agent_id
        upstreamApiKey = tokenRow.upstream_api_key
        db.prepare(`UPDATE agents SET last_seen_at = datetime('now') WHERE id = ?`).run(agentId)
        db.prepare(`UPDATE agent_tokens SET last_used_at = datetime('now') WHERE token_hash = ?`).run(tokenHash)
      }
    } else {
      // No token: use default agent if only one exists
      const agents = db.prepare(`SELECT id, upstream_api_key FROM agents WHERE status = 'active' LIMIT 2`).all() as { id: string; upstream_api_key: string | null }[]
      if (agents.length === 1) {
        agentId = agents[0].id
        upstreamApiKey = agents[0].upstream_api_key
      }
    }

    if (!agentId) {
      return res.status(401).json({ error: 'unauthorized', message: '无效的 Agent Token' })
    }

    // If token came via Authorization header and agent has an upstream key stored,
    // rewrite the Authorization header so the real API key reaches the upstream.
    if (isAuthAgToken && upstreamApiKey) {
      req.headers['authorization'] = `Bearer ${upstreamApiKey}`
    } else if (isAuthAgToken && !upstreamApiKey) {
      // No upstream key configured — remove the AgentGuard token so it doesn't leak upstream
      delete req.headers['authorization']
    }
    // Always strip the AgentGuard-specific header before forwarding
    delete req.headers['x-agentguard-token']

    // 3. Kill Switch check
    const killCheck = isBlocked(agentId)
    if (killCheck.blocked) {
      await writeBlockedLog({ agentId, req, targetUrl, alias, reason: killCheck.reason!, start })
      return res.status(503).json({ error: 'service_paused', message: killCheck.reason })
    }

    // 4. Estimate amount from request body
    const estimatedAmount = extractAmount(req.body, alias, req.path)

    // 5. Rule Engine
    const ruleDecision = evaluateRules({
      agentId,
      targetUrl,
      targetService: alias,
      method: req.method,
      estimatedAmount,
    })

    if (!ruleDecision.allowed) {
      recordFailure(agentId)
      await writeBlockedLog({ agentId, req, targetUrl, alias, reason: ruleDecision.reason!, ruleId: ruleDecision.ruleId, start })
      createAlert({
        agentId,
        severity: 'high',
        type: 'rule_blocked',
        title: '请求被规则阻断',
        message: ruleDecision.reason!,
      })
      return res.status(403).json({ error: 'rule_blocked', message: ruleDecision.reason })
    }

    // 6. Risk Detection
    const riskResult = detectRisk({ agentId, targetUrl, targetService: alias, estimatedAmount, method: req.method })
    if (riskResult.risky) {
      recordFailure(agentId)
      await writeBlockedLog({ agentId, req, targetUrl, alias, reason: riskResult.reason!, start })
      createAlert({
        agentId,
        severity: riskResult.severity ?? 'medium',
        type: 'risk_detected',
        title: '风险检测触发',
        message: riskResult.reason!,
      })
      return res.status(403).json({ error: 'risk_detected', message: riskResult.reason })
    }

    // 7. Forward request
    resetFailures(agentId)
    const proxyStart = Date.now()

    // Use http-proxy-middleware dynamically
    const proxy = createProxyMiddleware({
      target: targetBase,
      changeOrigin: true,
      pathRewrite: { [`^/proxy/${alias}`]: '' },
      on: {
        proxyRes: (proxyRes, proxyReq, originalReq) => {
          const latencyMs = Date.now() - start
          const proxyLatencyMs = Date.now() - proxyStart
          const expressReq = originalReq as unknown as Request & { _agentId?: string; _estimatedAmount?: number }

          recordTransaction({
            agentId: expressReq._agentId ?? agentId!,
            cost: expressReq._estimatedAmount ?? estimatedAmount,
            allowed: true,
          })

          logRequest({
            id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            agentId,
            method: req.method,
            targetUrl,
            targetService: alias,
            requestHeaders: req.headers as Record<string, string>,
            requestSize: Number(req.headers['content-length'] ?? 0),
            decision: 'allow',
            responseStatus: proxyRes.statusCode,
            latencyMs,
            proxyLatencyMs,
            estimatedCost: estimatedAmount,
            ipAddress: req.ip,
          })
        },
        error: (err, proxyReq, proxyRes) => {
          const latencyMs = Date.now() - start
          logRequest({
            id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            agentId,
            method: req.method,
            targetUrl,
            targetService: alias,
            decision: 'error',
            blockReason: (err as Error).message,
            latencyMs,
            ipAddress: req.ip,
          })
        },
      },
    })

    // Attach context to request for use in proxyRes handler
    ;(req as Request & { _agentId?: string; _estimatedAmount?: number })._agentId = agentId
    ;(req as Request & { _agentId?: string; _estimatedAmount?: number })._estimatedAmount = estimatedAmount

    proxy(req, res, next)
  })

  return router
}

async function writeBlockedLog(params: {
  agentId: string
  req: Request
  targetUrl: string
  alias: string
  reason: string
  ruleId?: string
  start: number
}) {
  logRequest({
    id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId: params.agentId,
    method: params.req.method,
    targetUrl: params.targetUrl,
    targetService: params.alias,
    requestHeaders: params.req.headers as Record<string, string>,
    decision: 'block',
    blockedRuleId: params.ruleId,
    blockReason: params.reason,
    latencyMs: Date.now() - params.start,
    ipAddress: params.req.ip,
  })
}

function extractAmount(body: unknown, alias: string, path: string): number {
  if (!body || typeof body !== 'object') return 0
  const b = body as Record<string, unknown>

  // Stripe: amount is in cents
  if (alias === 'stripe' && (path.includes('/charges') || path.includes('/payment_intents'))) {
    const raw = Number(b['amount'] ?? 0)
    return raw > 0 ? raw / 100 : 0
  }

  // OpenAI: estimate from max_tokens
  if (alias === 'openai' && path.includes('/chat/completions')) {
    const maxTokens = Number(b['max_tokens'] ?? 1000)
    return (maxTokens / 1000) * 0.002 // rough estimate
  }

  return 0
}
