// Sliding window rate limiter (in-memory, resets on restart)
interface WindowEntry {
  count: number
  windowStart: number
}

// key: `${agentId}:${service}:${windowType}`
const windows = new Map<string, WindowEntry>()

export interface RateLimitRule {
  maxRequests: number
  windowSeconds: number
}

export function checkRateLimit(
  agentId: string,
  service: string,
  rule: RateLimitRule
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${agentId}:${service}:${rule.windowSeconds}`
  const now = Date.now()
  let entry = windows.get(key)

  if (!entry || now - entry.windowStart >= rule.windowSeconds * 1000) {
    entry = { count: 0, windowStart: now }
    windows.set(key, entry)
  }

  const resetAt = Math.floor((entry.windowStart + rule.windowSeconds * 1000) / 1000)
  const remaining = Math.max(0, rule.maxRequests - entry.count - 1)

  if (entry.count >= rule.maxRequests) {
    return { allowed: false, remaining: 0, resetAt }
  }

  entry.count++
  return { allowed: true, remaining, resetAt }
}

export function clearAgentWindows(agentId: string) {
  for (const key of windows.keys()) {
    if (key.startsWith(`${agentId}:`)) windows.delete(key)
  }
}
