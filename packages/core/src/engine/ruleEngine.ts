import { getDb } from '../db/index.js'
import { checkRateLimit } from '../services/rateLimiter.js'
import { getAgentDailySpend, getAgentMonthSpend } from '../services/budgetManager.js'

export interface RuleCheckContext {
  agentId: string
  targetUrl: string
  targetService: string
  method: string
  estimatedAmount: number
}

export interface RuleDecision {
  allowed: boolean
  reason?: string
  ruleId?: string
  action?: string
}

interface DbRule {
  id: string
  type: string
  is_enabled: number
  action: string
  priority: number
  params: string
}

export function evaluateRules(ctx: RuleCheckContext): RuleDecision {
  const db = getDb()

  // Get agent's rule_set_id
  const agent = db.prepare('SELECT rule_set_id FROM agents WHERE id = ?').get(ctx.agentId) as
    | { rule_set_id: string | null }
    | undefined

  const ruleSetIds: string[] = []
  if (agent?.rule_set_id) ruleSetIds.push(agent.rule_set_id)

  // Also include default rule set
  const defaultSet = db.prepare('SELECT id FROM rule_sets WHERE is_default = 1').get() as
    | { id: string }
    | undefined
  if (defaultSet && !ruleSetIds.includes(defaultSet.id)) ruleSetIds.push(defaultSet.id)

  if (ruleSetIds.length === 0) return { allowed: true }

  const placeholders = ruleSetIds.map(() => '?').join(',')
  const rules = db
    .prepare(
      `SELECT id, type, is_enabled, action, priority, params
       FROM rules WHERE rule_set_id IN (${placeholders}) AND is_enabled = 1
       ORDER BY priority ASC`
    )
    .all(...ruleSetIds) as DbRule[]

  for (const rule of rules) {
    const params = JSON.parse(rule.params || '{}')
    const decision = checkRule(rule, params, ctx)
    if (decision) {
      if (rule.action === 'block' || rule.action === 'alert_and_block') {
        return { allowed: false, reason: decision, ruleId: rule.id, action: rule.action }
      }
      // alert only — continue but note it
    }
  }

  return { allowed: true }
}

function checkRule(rule: DbRule, params: Record<string, unknown>, ctx: RuleCheckContext): string | null {
  switch (rule.type) {
    case 'per_call_limit': {
      const limit = Number(params.limit ?? 0)
      if (limit > 0 && ctx.estimatedAmount > limit) {
        return `单笔金额 $${ctx.estimatedAmount.toFixed(2)} 超过限额 $${limit.toFixed(2)}`
      }
      break
    }
    case 'daily_budget': {
      const limit = Number(params.limit ?? 0)
      if (limit > 0) {
        const spent = getAgentDailySpend(ctx.agentId)
        if (spent + ctx.estimatedAmount > limit) {
          return `今日累计 $${spent.toFixed(2)} 将超过每日限额 $${limit.toFixed(2)}`
        }
      }
      break
    }
    case 'monthly_budget': {
      const limit = Number(params.limit ?? 0)
      if (limit > 0) {
        const spent = getAgentMonthSpend(ctx.agentId)
        if (spent + ctx.estimatedAmount > limit) {
          return `本月累计 $${spent.toFixed(2)} 将超过月度限额 $${limit.toFixed(2)}`
        }
      }
      break
    }
    case 'rate_limit': {
      const maxCalls = Number(params.max_calls ?? 0)
      const windowSec = Number(params.window_seconds ?? 60)
      if (maxCalls > 0) {
        const result = checkRateLimit(ctx.agentId, ctx.targetService, {
          maxRequests: maxCalls,
          windowSeconds: windowSec,
        })
        if (!result.allowed) {
          return `调用频率超限：${windowSec}秒内最多 ${maxCalls} 次`
        }
      }
      break
    }
    case 'domain_whitelist': {
      const domains: string[] = params.domains as string[] ?? []
      if (domains.length > 0) {
        const host = extractHost(ctx.targetUrl)
        const allowed = domains.some((d) => host === d || host.endsWith(`.${d}`))
        if (!allowed) return `域名 ${host} 不在白名单中`
      }
      break
    }
    case 'domain_blacklist': {
      const domains: string[] = params.domains as string[] ?? []
      const host = extractHost(ctx.targetUrl)
      const blocked = domains.some((d) => host === d || host.endsWith(`.${d}`))
      if (blocked) return `域名 ${host} 在黑名单中`
      break
    }
    case 'method_restriction': {
      const allowed: string[] = params.allowed_methods as string[] ?? []
      if (allowed.length > 0 && !allowed.includes(ctx.method.toUpperCase())) {
        return `HTTP 方法 ${ctx.method} 不被允许`
      }
      break
    }
    case 'time_window_block': {
      const start = String(params.start ?? '02:00')
      const end = String(params.end ?? '06:00')
      const now = new Date()
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      if (hhmm >= start && hhmm < end) {
        return `当前时间 ${hhmm} 在封锁时段 ${start}-${end} 内`
      }
      break
    }
  }
  return null
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
