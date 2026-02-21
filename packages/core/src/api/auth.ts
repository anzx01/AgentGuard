import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { getDb, getSetting, setSetting } from '../db/index.js'
import { logConfigChange } from '../services/auditLogger.js'

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>()

function getJwtSecret(): string {
  let secret = getSetting('jwt_secret')
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex')
    setSetting('jwt_secret', secret)
  }
  return secret
}

export function createAuthRouter(): Router {
  const router = Router()

  router.post('/login', async (req: Request, res: Response) => {
    const ip = req.ip ?? 'unknown'
    const attempt = loginAttempts.get(ip)
    if (attempt && attempt.lockedUntil > Date.now()) {
      return res.status(429).json({ error: 'too_many_attempts', message: '登录失败次数过多，请15分钟后重试' })
    }

    const { password } = req.body as { password?: string }
    if (!password) return res.status(400).json({ error: 'missing_password' })

    const storedHash = getSetting('dashboard_password_hash')
    if (!storedHash) {
      // First time setup: set password
      const hash = await bcrypt.hash(password, 12)
      setSetting('dashboard_password_hash', hash)
      setSetting('setup_completed', '1')
      loginAttempts.delete(ip)
      const token = jwt.sign({ sub: 'admin' }, getJwtSecret(), { expiresIn: '24h' })
      return res.json({ token, expiresAt: new Date(Date.now() + 86400_000).toISOString() })
    }

    const valid = await bcrypt.compare(password, storedHash)
    if (!valid) {
      const cur = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 }
      cur.count++
      if (cur.count >= 5) cur.lockedUntil = Date.now() + 15 * 60_000
      loginAttempts.set(ip, cur)
      return res.status(401).json({ error: 'invalid_password', message: '密码错误' })
    }

    loginAttempts.delete(ip)
    const timeoutMin = Number(getSetting('session_timeout_minutes') ?? 30)
    const token = jwt.sign({ sub: 'admin' }, getJwtSecret(), { expiresIn: `${timeoutMin}m` })
    logConfigChange({ action: 'login', resourceType: 'session', ipAddress: ip })
    res.json({ token, expiresAt: new Date(Date.now() + timeoutMin * 60_000).toISOString() })
  })

  router.post('/logout', (req: Request, res: Response) => {
    logConfigChange({ action: 'logout', resourceType: 'session', ipAddress: req.ip })
    res.json({ message: '已退出' })
  })

  router.get('/status', (req: Request, res: Response) => {
    const setupDone = getSetting('setup_completed') === '1'
    res.json({ setupCompleted: setupDone })
  })

  router.post('/change-password', async (req: Request, res: Response) => {
    const { current, next } = req.body as { current?: string; next?: string }
    if (!current || !next) return res.status(400).json({ error: 'missing_fields' })
    const storedHash = getSetting('dashboard_password_hash')
    if (!storedHash) return res.status(400).json({ error: 'no_password_set' })
    const valid = await bcrypt.compare(current, storedHash)
    if (!valid) return res.status(401).json({ error: 'invalid_current_password', message: '当前密码错误' })
    const hash = await bcrypt.hash(next, 12)
    setSetting('dashboard_password_hash', hash)
    logConfigChange({ action: 'change_password', resourceType: 'session', ipAddress: req.ip })
    res.json({ message: '密码已更新' })
  })

  return router
}

export function requireAuth(req: Request, res: Response, next: () => void) {
  const header = req.headers['authorization'] as string
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const token = header.slice(7)
  try {
    jwt.verify(token, getJwtSecret())
    next()
  } catch {
    res.status(401).json({ error: 'token_expired' })
  }
}
