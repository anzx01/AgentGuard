import { Router, Request, Response } from 'express'
import { getDb } from '../db/index.js'
import { logConfigChange } from '../services/auditLogger.js'
import { pauseAgent, resumeAgent } from '../services/killSwitch.js'
import crypto from 'crypto'

function genId() {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function genToken(agentId: string): { raw: string; hash: string; prefix: string } {
  const raw = `ag_live_${agentId}_${crypto.randomBytes(16).toString('hex')}`
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(0, 16)
  return { raw, hash, prefix }
}

export function createAgentsRouter(): Router {
  const router = Router()

  router.get('/', (_req: Request, res: Response) => {
    const db = getDb()
    const agents = db.prepare(`
      SELECT a.id, a.name, a.description, a.status, a.created_at, a.last_seen_at,
             at.token_prefix
      FROM agents a
      LEFT JOIN agent_tokens at ON at.agent_id = a.id AND at.is_active = 1
      ORDER BY a.created_at DESC
    `).all()
    res.json({ agents })
  })

  router.post('/', (req: Request, res: Response) => {
    const db = getDb()
    const { name, description } = req.body as { name?: string; description?: string }
    if (!name) return res.status(400).json({ error: 'name_required' })

    // Check Free tier limit
    const tier = db.prepare(`SELECT value FROM settings WHERE key = 'license_tier'`).get() as { value: string } | undefined
    const maxAgents = (tier?.value === 'pro') ? 10 : 1
    const count = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as { c: number }).c
    if (count >= maxAgents) {
      return res.status(403).json({ error: 'agent_limit', message: `当前套餐最多支持 ${maxAgents} 个 Agent` })
    }

    const id = genId()
    // Create default rule set for this agent
    const ruleSetId = `rs_${Date.now()}`
    db.prepare(`INSERT INTO rule_sets (id, name) VALUES (?, ?)`).run(ruleSetId, `${name} 规则集`)
    db.prepare(`INSERT INTO agents (id, name, description, rule_set_id) VALUES (?, ?, ?, ?)`).run(id, name, description ?? null, ruleSetId)

    const token = genToken(id)
    db.prepare(`INSERT INTO agent_tokens (id, agent_id, token_hash, token_prefix) VALUES (?, ?, ?, ?)`).run(
      `tok_${Date.now()}`, id, token.hash, token.prefix
    )

    logConfigChange({ action: 'create', resourceType: 'agent', resourceId: id, after: { name, description }, ipAddress: req.ip })
    res.status(201).json({ id, name, token: token.raw, note: 'Token 仅显示一次，请立即保存' })
  })

  router.get('/:id', (req: Request, res: Response) => {
    const db = getDb()
    const agent = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(req.params.id)
    if (!agent) return res.status(404).json({ error: 'not_found' })

    const rules = db.prepare(`
      SELECT r.* FROM rules r
      JOIN rule_sets rs ON rs.id = r.rule_set_id
      JOIN agents a ON a.rule_set_id = rs.id
      WHERE a.id = ?
    `).all(req.params.id)

    res.json({ agent, rules })
  })

  router.put('/:id', (req: Request, res: Response) => {
    const db = getDb()
    const { name, description } = req.body as { name?: string; description?: string }
    const before = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
    if (!before) return res.status(404).json({ error: 'not_found' })

    db.prepare(`UPDATE agents SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = datetime('now') WHERE id = ?`)
      .run(name ?? null, description ?? null, req.params.id)

    logConfigChange({ action: 'update', resourceType: 'agent', resourceId: req.params.id, before, after: req.body, ipAddress: req.ip })
    res.json(db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id))
  })

  router.delete('/:id', (req: Request, res: Response) => {
    const db = getDb()
    const before = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
    if (!before) return res.status(404).json({ error: 'not_found' })
    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id)
    logConfigChange({ action: 'delete', resourceType: 'agent', resourceId: req.params.id, before, ipAddress: req.ip })
    res.json({ message: 'Agent 已删除' })
  })

  router.post('/:id/pause', (req: Request, res: Response) => {
    const db = getDb()
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id)
    if (!agent) return res.status(404).json({ error: 'not_found' })
    db.prepare(`UPDATE agents SET status = 'paused', updated_at = datetime('now') WHERE id = ?`).run(req.params.id)
    pauseAgent(req.params.id, 'user')
    logConfigChange({ action: 'pause', resourceType: 'agent', resourceId: req.params.id, ipAddress: req.ip })
    res.json({ id: req.params.id, status: 'paused', pausedAt: new Date().toISOString() })
  })

  router.post('/:id/resume', (req: Request, res: Response) => {
    const db = getDb()
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id)
    if (!agent) return res.status(404).json({ error: 'not_found' })
    db.prepare(`UPDATE agents SET status = 'active', updated_at = datetime('now') WHERE id = ?`).run(req.params.id)
    resumeAgent(req.params.id)
    logConfigChange({ action: 'resume', resourceType: 'agent', resourceId: req.params.id, ipAddress: req.ip })
    res.json({ id: req.params.id, status: 'active', resumedAt: new Date().toISOString() })
  })

  router.post('/:id/rotate-token', (req: Request, res: Response) => {
    const db = getDb()
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id)
    if (!agent) return res.status(404).json({ error: 'not_found' })

    // Deactivate old tokens
    db.prepare(`UPDATE agent_tokens SET is_active = 0 WHERE agent_id = ?`).run(req.params.id)

    const token = genToken(req.params.id)
    db.prepare(`INSERT INTO agent_tokens (id, agent_id, token_hash, token_prefix) VALUES (?, ?, ?, ?)`).run(
      `tok_${Date.now()}`, req.params.id, token.hash, token.prefix
    )
    logConfigChange({ action: 'rotate_token', resourceType: 'agent', resourceId: req.params.id, ipAddress: req.ip })
    res.json({ token: token.raw, note: 'Token 仅显示一次，请立即保存' })
  })

  return router
}
