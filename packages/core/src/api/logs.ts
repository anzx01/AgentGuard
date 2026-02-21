import { Router, Request, Response } from 'express'
import { getDb } from '../db/index.js'
import { getGlobalSummary, getAgentDailySpend, getAgentMonthSpend } from '../services/budgetManager.js'

export function createLogsRouter(): Router {
  const router = Router()

  router.get('/logs', (req: Request, res: Response) => {
    const db = getDb()
    const {
      page = '1', pageSize = '50',
      agentId, status, service, from, to, q
    } = req.query as Record<string, string>

    const offset = (Number(page) - 1) * Number(pageSize)
    const conditions: string[] = []
    const params: unknown[] = []

    if (agentId) { conditions.push('t.agent_id = ?'); params.push(agentId) }
    if (status) { conditions.push('t.decision = ?'); params.push(status) }
    if (service) { conditions.push('t.target_service = ?'); params.push(service) }
    if (from) { conditions.push('t.timestamp >= ?'); params.push(from) }
    if (to) { conditions.push('t.timestamp <= ?'); params.push(to) }
    if (q) { conditions.push('(t.target_url LIKE ? OR a.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (db.prepare(`
      SELECT COUNT(*) as c FROM transactions t
      LEFT JOIN agents a ON a.id = t.agent_id ${where}
    `).get(...params) as { c: number }).c

    const rows = db.prepare(`
      SELECT t.*, a.name as agent_name FROM transactions t
      LEFT JOIN agents a ON a.id = t.agent_id
      ${where}
      ORDER BY t.timestamp DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), offset)

    res.json({ total, page: Number(page), pageSize: Number(pageSize), data: rows })
  })

  router.get('/budget/summary', (_req: Request, res: Response) => {
    const db = getDb()
    const summary = getGlobalSummary()

    const agents = db.prepare(`SELECT id, name FROM agents WHERE status = 'active'`).all() as { id: string; name: string }[]
    const byAgent = agents.map(a => ({
      agentId: a.id,
      name: a.name,
      todaySpend: getAgentDailySpend(a.id),
      monthSpend: getAgentMonthSpend(a.id),
    }))

    res.json({ ...summary, byAgent })
  })

  return router
}
