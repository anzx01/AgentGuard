import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { getDb } from '../db/index.js'
import { getSetting, setSetting } from '../db/index.js'
import { logConfigChange } from '../services/auditLogger.js'

export function createSettingsRouter(): Router {
  const router = Router()

  // Service aliases
  router.get('/service-aliases', (_req: Request, res: Response) => {
    const db = getDb()
    res.json({ aliases: db.prepare('SELECT * FROM service_aliases ORDER BY is_builtin DESC, alias ASC').all() })
  })

  router.post('/service-aliases', (req: Request, res: Response) => {
    const db = getDb()
    const { alias, target_url, description } = req.body as { alias?: string; target_url?: string; description?: string }
    if (!alias || !target_url) return res.status(400).json({ error: 'alias_and_target_url_required' })

    const id = `alias_${Date.now()}`
    db.prepare(`INSERT INTO service_aliases (id, alias, target_url, description) VALUES (?, ?, ?, ?)`)
      .run(id, alias, target_url, description ?? null)

    logConfigChange({ action: 'create', resourceType: 'service_alias', resourceId: id, after: req.body, ipAddress: req.ip })
    res.status(201).json(db.prepare('SELECT * FROM service_aliases WHERE id = ?').get(id))
  })

  router.put('/service-aliases/:id', (req: Request, res: Response) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM service_aliases WHERE id = ?').get(req.params.id) as { is_builtin: number } | undefined
    if (!row) return res.status(404).json({ error: 'not_found' })

    const { alias, target_url, description, is_enabled } = req.body as {
      alias?: string; target_url?: string; description?: string; is_enabled?: boolean
    }
    db.prepare(`
      UPDATE service_aliases SET
        alias = COALESCE(?, alias),
        target_url = COALESCE(?, target_url),
        description = COALESCE(?, description),
        is_enabled = COALESCE(?, is_enabled)
      WHERE id = ?
    `).run(alias ?? null, target_url ?? null, description ?? null, is_enabled !== undefined ? (is_enabled ? 1 : 0) : null, req.params.id)

    logConfigChange({ action: 'update', resourceType: 'service_alias', resourceId: req.params.id, before: row, after: req.body, ipAddress: req.ip })
    res.json(db.prepare('SELECT * FROM service_aliases WHERE id = ?').get(req.params.id))
  })

  router.delete('/service-aliases/:id', (req: Request, res: Response) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM service_aliases WHERE id = ?').get(req.params.id) as { is_builtin: number } | undefined
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (row.is_builtin) return res.status(403).json({ error: 'cannot_delete_builtin' })
    db.prepare('DELETE FROM service_aliases WHERE id = ?').run(req.params.id)
    logConfigChange({ action: 'delete', resourceType: 'service_alias', resourceId: req.params.id, before: row, ipAddress: req.ip })
    res.json({ message: '别名已删除' })
  })

  // System settings
  router.get('/settings', (_req: Request, res: Response) => {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings WHERE is_encrypted = 0').all() as { key: string; value: string }[]
    const result: Record<string, string> = {}
    for (const r of rows) result[r.key] = r.value
    res.json(result)
  })

  router.put('/settings', (req: Request, res: Response) => {
    const allowed = [
      'proxy_port', 'api_port', 'bind_address', 'proxy_ip_allowlist',
      'session_timeout_minutes', 'log_retention_days', 'alert_retention_days',
      'auto_backup_enabled', 'auto_backup_interval', 'auto_backup_keep', 'backup_path',
    ]
    const updates = req.body as Record<string, string>
    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) setSetting(k, String(v))
    }
    logConfigChange({ action: 'update', resourceType: 'settings', after: updates, ipAddress: req.ip })
    res.json({ message: '设置已保存' })
  })

  // License
  router.post('/license/activate', async (req: Request, res: Response) => {
    const { key } = req.body as { key?: string }
    if (!key) return res.status(400).json({ error: 'key_required' })

    // In production, call license server. For now, accept any AG-XXXX-XXXX-XXXX-XXXX format
    const valid = /^AG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.toUpperCase())
    if (!valid) return res.status(400).json({ error: 'invalid_key_format' })

    setSetting('license_tier', 'pro')
    setSetting('license_key', key)
    setSetting('license_activated_at', new Date().toISOString())
    logConfigChange({ action: 'license_activate', resourceType: 'license', ipAddress: req.ip })
    res.json({ plan: 'pro', message: 'Pro 版本已激活' })
  })

  router.get('/license', (_req: Request, res: Response) => {
    const tier = getSetting('license_tier') ?? 'free'
    const activatedAt = getSetting('license_activated_at')
    res.json({ tier, activatedAt })
  })

  // Danger zone
  router.post('/settings/clear-logs', (req: Request, res: Response) => {
    const db = getDb()
    db.prepare('DELETE FROM transactions').run()
    logConfigChange({ action: 'clear_logs', resourceType: 'settings', ipAddress: req.ip })
    res.json({ message: '日志已清空' })
  })

  router.post('/settings/reset-rules', (req: Request, res: Response) => {
    const db = getDb()
    db.prepare('DELETE FROM rules').run()
    logConfigChange({ action: 'reset_rules', resourceType: 'settings', ipAddress: req.ip })
    res.json({ message: '规则已重置' })
  })

  return router
}
