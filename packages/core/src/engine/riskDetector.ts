import { getDb } from '../db/index.js'
import { getAgentDailySpend } from '../services/budgetManager.js'

export interface RiskResult {
  risky: boolean
  reason?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
}

// Track consecutive failures per agent (in-memory)
const consecutiveFailures = new Map<string, number>()

export function recordFailure(agentId: string): number {
  const count = (consecutiveFailures.get(agentId) ?? 0) + 1
  consecutiveFailures.set(agentId, count)
  return count
}

export function resetFailures(agentId: string) {
  consecutiveFailures.delete(agentId)
}

export function getConsecutiveFailures(agentId: string): number {
  return consecutiveFailures.get(agentId) ?? 0
}

export function detectRisk(params: {
  agentId: string
  targetUrl: string
  targetService: string
  estimatedAmount: number
  method: string
}): RiskResult {
  const db = getDb()

  // 1. Unknown domain check
  const host = extractHost(params.targetUrl)
  const alias = db
    .prepare('SELECT id FROM service_aliases WHERE alias = ? AND is_enabled = 1')
    .get(params.targetService) as { id: string } | undefined

  if (!alias) {
    // Check if domain matches any known alias target
    const knownAlias = db
      .prepare("SELECT id FROM service_aliases WHERE target_url LIKE ? AND is_enabled = 1")
      .get(`%${host}%`) as { id: string } | undefined
    if (!knownAlias) {
      return { risky: true, reason: `访问未知域名 ${host}`, severity: 'medium' }
    }
  }

  // 2. Amount spike detection (compare to 7-day average)
  if (params.estimatedAmount > 0) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const avgRow = db
      .prepare(`
        SELECT AVG(total_cost / NULLIF(allowed_calls, 0)) as avg_cost
        FROM budget_snapshots
        WHERE agent_id = ? AND snapshot_hour >= ?
      `)
      .get(params.agentId, sevenDaysAgo) as { avg_cost: number | null }

    const avg = avgRow.avg_cost ?? 0
    if (avg > 0 && params.estimatedAmount > avg * 5) {
      return {
        risky: true,
        reason: `单笔金额 $${params.estimatedAmount.toFixed(2)} 超过7日均值 $${avg.toFixed(2)} 的5倍`,
        severity: 'high',
      }
    }
  }

  // 3. Late-night large amount
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 6 && params.estimatedAmount > 10) {
    return {
      risky: true,
      reason: `深夜时段（${hour}:00）发生大额操作 $${params.estimatedAmount.toFixed(2)}`,
      severity: 'medium',
    }
  }

  // 4. Consecutive failures
  const failures = getConsecutiveFailures(params.agentId)
  if (failures >= 5) {
    return {
      risky: true,
      reason: `Agent 连续 ${failures} 次请求被阻断`,
      severity: 'high',
    }
  }

  return { risky: false }
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
