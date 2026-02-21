import { Router, Request, Response } from 'express'
import { getDb } from '../db/index.js'
import { logConfigChange } from '../services/auditLogger.js'

export function createAlertsRouter(): Router {
  const router = Router()

  router.get('/', (req: Request, res: Response) => {
    const db = getDb()
    const { status, severity, page = '1', pageSize = '20' } = req.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(pageSize)
    const conditions: string[] = []
    const params: unknown[] = []

    if (status) { conditions.push('status = ?'); params.push(status) }
    if (severity) { conditions.push('severity = ?'); params.push(severity) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const total = (db.prepare(`SELECT COUNT(*) as c FROM alert_events ${where}`).get(...params) as { c: number }).c
    const data = db.prepare(`SELECT * FROM alert_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset)

    res.json({ total, page: Number(page), pageSize: Number(pageSize), data })
  })

  router.post('/:id/acknowledge', (req: Request, res: Response) => {
    const db = getDb()
    const { note } = req.body as { note?: string }
    const alert = db.prepare('SELECT id FROM alert_events WHERE id = ?').get(req.params.id)
    if (!alert) return res.status(404).json({ error: 'not_found' })

    db.prepare(`UPDATE alert_events SET status = 'acknowledged', acknowledged_at = datetime('now'), ack_note = ? WHERE id = ?`)
      .run(note ?? null, req.params.id)

    res.json(db.prepare('SELECT * FROM alert_events WHERE id = ?').get(req.params.id))
  })

  router.post('/batch-acknowledge', (req: Request, res: Response) => {
    const db = getDb()
    const { ids } = req.body as { ids?: string[] }
    if (!ids?.length) return res.status(400).json({ error: 'ids_required' })

    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`UPDATE alert_events SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id IN (${placeholders})`).run(...ids)
    res.json({ acknowledged: ids.length })
  })

  // Alert channels
  router.get('/channels', (_req: Request, res: Response) => {
    const db = getDb()
    res.json({ channels: db.prepare('SELECT * FROM alert_channels ORDER BY created_at DESC').all() })
  })

  router.post('/channels', (req: Request, res: Response) => {
    const db = getDb()
    const { name, type, config, min_severity = 'high', alert_types = [] } = req.body as {
      name?: string; type?: string; config?: Record<string, unknown>
      min_severity?: string; alert_types?: string[]
    }
    if (!name || !type) return res.status(400).json({ error: 'name_and_type_required' })

    const id = `ch_${Date.now()}`
    db.prepare(`INSERT INTO alert_channels (id, name, type, config, min_severity, alert_types) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, name, type, JSON.stringify(config ?? {}), min_severity, JSON.stringify(alert_types))

    logConfigChange({ action: 'create', resourceType: 'alert_channel', resourceId: id, after: req.body, ipAddress: req.ip })
    res.status(201).json(db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(id))
  })

  router.put('/channels/:id', (req: Request, res: Response) => {
    const db = getDb()
    const before = db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(req.params.id)
    if (!before) return res.status(404).json({ error: 'not_found' })

    const { name, config, min_severity, alert_types, is_enabled } = req.body as {
      name?: string; config?: Record<string, unknown>; min_severity?: string
      alert_types?: string[]; is_enabled?: boolean
    }
    db.prepare(`
      UPDATE alert_channels SET
        name = COALESCE(?, name),
        config = COALESCE(?, config),
        min_severity = COALESCE(?, min_severity),
        alert_types = COALESCE(?, alert_types),
        is_enabled = COALESCE(?, is_enabled)
      WHERE id = ?
    `).run(
      name ?? null,
      config ? JSON.stringify(config) : null,
      min_severity ?? null,
      alert_types ? JSON.stringify(alert_types) : null,
      is_enabled !== undefined ? (is_enabled ? 1 : 0) : null,
      req.params.id
    )

    logConfigChange({ action: 'update', resourceType: 'alert_channel', resourceId: req.params.id, before, after: req.body, ipAddress: req.ip })
    res.json(db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(req.params.id))
  })

  router.delete('/channels/:id', (req: Request, res: Response) => {
    const db = getDb()
    const before = db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(req.params.id)
    if (!before) return res.status(404).json({ error: 'not_found' })
    db.prepare('DELETE FROM alert_channels WHERE id = ?').run(req.params.id)
    logConfigChange({ action: 'delete', resourceType: 'alert_channel', resourceId: req.params.id, before, ipAddress: req.ip })
    res.json({ message: '渠道已删除' })
  })

  return router
}
