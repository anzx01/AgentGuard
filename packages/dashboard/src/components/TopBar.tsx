'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'

interface KillSwitchState {
  global: { paused: boolean; reason?: string }
}

export default function TopBar() {
  const [ksState, setKsState] = useState<KillSwitchState>({ global: { paused: false } })
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    apiFetch<KillSwitchState>('/kill-switch/status').then(setKsState).catch(() => {})
  }, [])

  async function toggleKillSwitch() {
    if (ksState.global.paused) {
      await apiFetch('/kill-switch/deactivate', { method: 'POST', body: JSON.stringify({ scope: 'global' }) })
      setKsState({ global: { paused: false } })
    } else {
      if (!confirming) { setConfirming(true); return }
      await apiFetch('/kill-switch/activate', { method: 'POST', body: JSON.stringify({ reason: '手动触发', scope: 'global' }) })
      setKsState({ global: { paused: true } })
      setConfirming(false)
    }
  }

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full ${ksState.global.paused ? 'bg-red-500' : 'bg-green-500'}`} />
        <span className="text-sm text-gray-400">
          {ksState.global.paused ? '已暂停' : '运行中'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {confirming && (
          <span className="text-xs text-yellow-400">再次点击确认暂停所有请求</span>
        )}
        <button
          onClick={toggleKillSwitch}
          onBlur={() => setConfirming(false)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            ksState.global.paused
              ? 'bg-green-700 hover:bg-green-600 text-white'
              : confirming
              ? 'bg-red-500 hover:bg-red-400 text-white'
              : 'bg-red-900 hover:bg-red-800 text-red-300'
          }`}
        >
          {ksState.global.paused ? '▶ 恢复服务' : '■ Kill Switch'}
        </button>
      </div>
    </header>
  )
}
