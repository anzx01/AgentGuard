import { Router, Request, Response } from 'express'
import { getDb } from '../db/index.js'
import { logConfigChange } from '../services/auditLogger.js'

export function createRulesRouter(): Router {
  const router = Router()

  router.get('/rule-sets', (_req: Request, res: Response) => {
    const db = getDb()
    const sets = db.prepare('SELECT * FROM rule_sets ORDER BY created_at DESC').all()
    res.json({ ruleSets: sets })
  })

  router.get('/rule-sets/:id/rules', (req: Request, res: Response) => {
    const db = getDb()
    const rules = db.prepare('SELECT * FROM rules WHERE rule_set_id = ? ORDER BY priority ASC').all(req.params.id)
    res.json({ rules })
  })

  router.post('/rule-sets/:id/rules', (req: Request, res: Response) => {
    const db = getDb()
    const { name, type, action, priority, params } = req.body as {
      name?: string; type?: string; action?: string; priority?: number; params?: Record<string, unknown>
    }
    if (!name || !type) return res.status(400).json({ error: 'name_and_type_required' })

    // Check Free tier rule limit
    const tier = (db.prepare(`SELECT value FROM settings WHERE key = 'license_tier'`).get() as { value: string } | undefined)?.value
    if (tier !== 'pro') {
      const count = (db.prepare('SELECT COUNT(*) as c FROM rules WHERE rule_set_id = ?').get(req.params.id) as { c: number }).c
      if (count >= 5) return res.status(403).json({ error: 'rule_limit', message: 'Free 版每个规则集最多 5 条规则' })
    }

    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    db.prepare(`
      INSERT INTO rules (id, rule_set_id, name, type, action, priority, params)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, name, type, action ?? 'block', priority ?? 100, JSON.stringify(params ?? {}))

    logConfigChange({ action: 'create', resourceType: 'rule', resourceId: id, after: req.body, ipAddress: req.ip })
    res.status(201).json(db.prepare('SELECT * FROM rules WHERE id = ?').get(id))
  })

  router.put('/rules/:id', (req: Request, res: Response) => {
    const db = getDb()
    const before = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id)
    if (!before) return res.status(404).json({ error: 'not_found' })

    const { name, type, action, priority, params, is_enabled } = req.body as {
      name?: string; type?: string; action?: string; priority?: number
      params?: Record<string, unknown>; is_enabled?: boolean
    }

    db.prepare(`
      UPDATE rules SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        action = COALESCE(?, action),
        priority = COALESCE(?, priority),
        params = COALESCE(?, params),
        is_enabled = COALESCE(?, is_enabled),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ?? null, type ?? null, action ?? null, priority ?? null,
      params ? JSON.stringify(params) : null,
      is_enabled !== undefined ? (is_enabled ? 1 : 0) : null,
      req.params.id
    )

    logConfigChange({ action: 'update', resourceType: 'rule', resourceId: req.params.id, before, after: req.body, ipAddress: req.ip })
    res.json(db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id))
  })

  router.delete('/rules/:id', (req: Request, res: Response) => {
    const db = getDb()
    const before = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id)
    if (!before) return res.status(404).json({ error: 'not_found' })
    db.prepare('DELETE FROM rules WHERE id = ?').run(req.params.id)
    logConfigChange({ action: 'delete', resourceType: 'rule', resourceId: req.params.id, before, ipAddress: req.ip })
    res.json({ message: '规则已删除' })
  })

  return router
}
