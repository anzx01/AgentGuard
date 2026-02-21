import { getDb } from '../db/index.js'

export interface BudgetSummary {
  todaySpend: number
  monthSpend: number
  todayCalls: number
  todayBlocked: number
}

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10) + 'T00:00:00'
}

export function getMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function getHourKey(): string {
  const d = new Date()
  return `${d.toISOString().slice(0, 13)}:00:00`
}

export function recordTransaction(params: {
  agentId: string | null
  cost: number
  allowed: boolean
}) {
  const db = getDb()
  const hourKey = getHourKey()

  if (!params.agentId) return

  db.prepare(`
    INSERT INTO budget_snapshots (id, agent_id, snapshot_hour, total_calls, allowed_calls, blocked_calls, total_cost)
    VALUES (lower(hex(randomblob(8))), ?, ?, 1, ?, ?, ?)
    ON CONFLICT(agent_id, snapshot_hour) DO UPDATE SET
      total_calls = total_calls + 1,
      allowed_calls = allowed_calls + excluded.allowed_calls,
      blocked_calls = blocked_calls + excluded.blocked_calls,
      total_cost = total_cost + excluded.total_cost
  `).run(
    params.agentId,
    hourKey,
    params.allowed ? 1 : 0,
    params.allowed ? 0 : 1,
    params.cost
  )
}

export function getAgentDailySpend(agentId: string): number {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const row = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as total
    FROM budget_snapshots
    WHERE agent_id = ? AND snapshot_hour LIKE ?
  `).get(agentId, `${today}%`) as { total: number }
  return row.total
}

export function getAgentMonthSpend(agentId: string): number {
  const db = getDb()
  const month = getMonthKey()
  const row = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as total
    FROM budget_snapshots
    WHERE agent_id = ? AND snapshot_hour LIKE ?
  `).get(agentId, `${month}%`) as { total: number }
  return row.total
}

export function getGlobalSummary(): BudgetSummary {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const month = getMonthKey()

  const todayRow = db.prepare(`
    SELECT COALESCE(SUM(total_cost),0) as spend,
           COALESCE(SUM(total_calls),0) as calls,
           COALESCE(SUM(blocked_calls),0) as blocked
    FROM budget_snapshots WHERE snapshot_hour LIKE ?
  `).get(`${today}%`) as { spend: number; calls: number; blocked: number }

  const monthRow = db.prepare(`
    SELECT COALESCE(SUM(total_cost),0) as spend
    FROM budget_snapshots WHERE snapshot_hour LIKE ?
  `).get(`${month}%`) as { spend: number }

  return {
    todaySpend: todayRow.spend,
    monthSpend: monthRow.spend,
    todayCalls: todayRow.calls,
    todayBlocked: todayRow.blocked,
  }
}
