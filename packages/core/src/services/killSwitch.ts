import { getSetting, setSetting } from '../db/index.js'

export interface KillSwitchState {
  global: { paused: boolean; pausedAt?: string; pausedBy?: string; reason?: string }
  agents: Record<string, { paused: boolean; pausedAt?: string; pausedBy?: string }>
}

const state: KillSwitchState = {
  global: { paused: false },
  agents: {},
}

export function loadKillSwitchState() {
  const v = getSetting('kill_switch_active')
  state.global.paused = v === '1'
}

export function getKillSwitchState(): KillSwitchState {
  return state
}

export function activateGlobal(reason: string, pausedBy = 'user') {
  state.global = { paused: true, pausedAt: new Date().toISOString(), pausedBy, reason }
  setSetting('kill_switch_active', '1')
}

export function deactivateGlobal() {
  state.global = { paused: false }
  setSetting('kill_switch_active', '0')
}

export function pauseAgent(agentId: string, pausedBy = 'user') {
  state.agents[agentId] = { paused: true, pausedAt: new Date().toISOString(), pausedBy }
}

export function resumeAgent(agentId: string) {
  delete state.agents[agentId]
}

export function isBlocked(agentId?: string): { blocked: boolean; reason?: string } {
  if (state.global.paused) return { blocked: true, reason: state.global.reason || 'Global kill switch active' }
  if (agentId && state.agents[agentId]?.paused) return { blocked: true, reason: 'Agent paused' }
  return { blocked: false }
}
