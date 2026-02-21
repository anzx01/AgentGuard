import { Router, Request, Response } from 'express'
import { getDb } from '../db/index.js'
import { activateGlobal, deactivateGlobal, pauseAgent, resumeAgent, getKillSwitchState } from '../services/killSwitch.js'
import { logConfigChange } from '../services/auditLogger.js'
import { createAlert } from '../services/alertManager.js'

export function createKillSwitchRouter(): Router {
  const router = Router()

  router.get('/status', (_req: Request, res: Response) => {
    res.json(getKillSwitchState())
  })

  router.post('/activate', (req: Request, res: Response) => {
    const { reason = '手动触发', scope = 'global', agentId } = req.body as {
      reason?: string; scope?: string; agentId?: string
    }

    if (scope === 'agent' && agentId) {
      pauseAgent(agentId, 'user')
      logConfigChange({ action: 'kill_switch_agent_on', resourceType: 'kill_switch', resourceId: agentId, ipAddress: req.ip })
      createAlert({ agentId, severity: 'high', type: 'system.kill_switch.on', title: 'Agent Kill Switch 已激活', message: `Agent ${agentId} 已暂停：${reason}` })
    } else {
      activateGlobal(reason, 'user')
      logConfigChange({ action: 'kill_switch_global_on', resourceType: 'kill_switch', ipAddress: req.ip })
      createAlert({ severity: 'critical', type: 'system.kill_switch.on', title: '全局 Kill Switch 已激活', message: reason })
    }

    res.json({ status: 'activated', scope, reason, activatedAt: new Date().toISOString() })
  })

  router.post('/deactivate', (req: Request, res: Response) => {
    const { scope = 'global', agentId } = req.body as { scope?: string; agentId?: string }

    if (scope === 'agent' && agentId) {
      resumeAgent(agentId)
      logConfigChange({ action: 'kill_switch_agent_off', resourceType: 'kill_switch', resourceId: agentId, ipAddress: req.ip })
    } else {
      deactivateGlobal()
      logConfigChange({ action: 'kill_switch_global_off', resourceType: 'kill_switch', ipAddress: req.ip })
      createAlert({ severity: 'info', type: 'system.kill_switch.off', title: '全局 Kill Switch 已解除', message: '系统已恢复正常运行' })
    }

    res.json({ status: 'deactivated', scope, deactivatedAt: new Date().toISOString() })
  })

  return router
}
