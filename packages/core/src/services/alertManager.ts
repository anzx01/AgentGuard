import { getDb } from '../db/index.js'
import { logSystemEvent } from './auditLogger.js'
import notifier from 'node-notifier'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface AlertEvent {
  id: string
  agentId?: string
  transactionId?: string
  severity: AlertSeverity
  type: string
  title: string
  message: string
  details?: unknown
}

// Dedup window: same type+agentId within 300s only fires once
const dedupCache = new Map<string, number>()

export function createAlert(event: Omit<AlertEvent, 'id'>) {
  const db = getDb()
  const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Dedup check
  const dedupKey = `${event.type}:${event.agentId ?? 'global'}`
  const lastFired = dedupCache.get(dedupKey) ?? 0
  const now = Date.now()
  if (now - lastFired < 300_000) return // within 300s window, skip
  dedupCache.set(dedupKey, now)

  db.prepare(`
    INSERT INTO alert_events (id, agent_id, transaction_id, severity, type, title, message, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    event.agentId ?? null,
    event.transactionId ?? null,
    event.severity,
    event.type,
    event.title,
    event.message,
    event.details ? JSON.stringify(event.details) : null
  )

  logSystemEvent('alert_created', event.title, event.severity)
  dispatchAlert({ ...event, id })
}

function dispatchAlert(event: AlertEvent) {
  const db = getDb()
  const channels = db.prepare(`
    SELECT * FROM alert_channels WHERE is_enabled = 1
  `).all() as Array<{
    id: string; type: string; config: string; min_severity: string; alert_types: string
  }>

  const severityOrder: AlertSeverity[] = ['info', 'low', 'medium', 'high', 'critical']

  for (const ch of channels) {
    const minIdx = severityOrder.indexOf(ch.min_severity as AlertSeverity)
    const evtIdx = severityOrder.indexOf(event.severity)
    if (evtIdx < minIdx) continue

    const allowedTypes: string[] = JSON.parse(ch.alert_types || '[]')
    if (allowedTypes.length > 0 && !allowedTypes.includes(event.type)) continue

    const config = JSON.parse(ch.config || '{}')

    if (ch.type === 'local_notification') {
      sendLocalNotification(event)
    } else if (ch.type === 'webhook') {
      sendWebhook(event, config).catch((e) => console.error('[AlertManager] webhook error', e))
    } else if (ch.type === 'email') {
      sendEmail(event, config).catch((e) => console.error('[AlertManager] email error', e))
    }
  }
}

function sendLocalNotification(event: AlertEvent) {
  notifier.notify({
    title: `AgentGuard [${event.severity.toUpperCase()}]`,
    message: event.message,
    sound: event.severity === 'critical' || event.severity === 'high',
  })
}

async function sendWebhook(event: AlertEvent, config: Record<string, string>) {
  const url = config.url
  if (!url) return

  const payload = {
    event: event.type,
    severity: event.severity,
    agent_id: event.agentId,
    title: event.title,
    message: event.message,
    details: event.details,
    timestamp: new Date().toISOString(),
    source: 'agentguard',
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (config.secret) {
    const sig = crypto
      .createHmac('sha256', config.secret)
      .update(JSON.stringify(payload))
      .digest('hex')
    headers['X-AgentGuard-Signature'] = `sha256=${sig}`
    headers['X-AgentGuard-Timestamp'] = String(Date.now())
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
}

async function sendEmail(event: AlertEvent, config: Record<string, string>) {
  if (!config.smtp_host || !config.to) return

  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: Number(config.smtp_port ?? 587),
    secure: config.smtp_secure === 'true',
    auth: { user: config.smtp_user, pass: config.smtp_pass },
  })

  await transporter.sendMail({
    from: config.from || config.smtp_user,
    to: config.to,
    subject: `[AgentGuard][${event.severity.toUpperCase()}] ${event.title}`,
    text: `${event.message}\n\nAgent: ${event.agentId ?? 'N/A'}\nTime: ${new Date().toISOString()}`,
  })
}
