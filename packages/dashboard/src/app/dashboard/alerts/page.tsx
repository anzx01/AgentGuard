'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Alert {
  id: string
  severity: string
  type: string
  title: string
  message: string
  status: string
  agent_id: string | null
  created_at: string
  acknowledged_at: string | null
}

const severityColor: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-800',
  high: 'bg-orange-500/20 text-orange-400 border-orange-800',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-800',
  low: 'bg-gray-500/20 text-gray-400 border-gray-700',
  info: 'bg-blue-500/20 text-blue-400 border-blue-800',
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState({ status: 'open', severity: '' })
  const [selected, setSelected] = useState<string[]>([])

  async function load() {
    const params = new URLSearchParams({
      pageSize: '50',
      ...(filter.status && { status: filter.status }),
      ...(filter.severity && { severity: filter.severity }),
    })
    const data = await apiFetch<{ total: number; data: Alert[] }>(`/alerts?${params}`)
    setAlerts(data.data)
    setTotal(data.total)
  }

  useEffect(() => { load() }, [filter])

  async function acknowledge(id: string) {
    await apiFetch(`/alerts/${id}/acknowledge`, { method: 'POST', body: JSON.stringify({}) })
    load()
  }

  async function batchAcknowledge() {
    if (!selected.length) return
    await apiFetch('/alerts/batch-acknowledge', { method: 'POST', body: JSON.stringify({ ids: selected }) })
    setSelected([])
    load()
  }

  function toggleSelect(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const counts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    open: alerts.filter(a => a.status === 'open').length,
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">告警中心</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'CRITICAL', value: counts.critical, color: 'text-red-400' },
          { label: 'HIGH', value: counts.high, color: 'text-orange-400' },
          { label: 'MEDIUM', value: counts.medium, color: 'text-yellow-400' },
          { label: '待处理', value: counts.open, color: 'text-white' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-gray-500 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none"
        >
          <option value="">全部状态</option>
          <option value="open">未处理</option>
          <option value="acknowledged">已确认</option>
        </select>
        <select
          value={filter.severity}
          onChange={e => setFilter(f => ({ ...f, severity: e.target.value }))}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none"
        >
          <option value="">全部严重度</option>
          <option value="critical">CRITICAL</option>
          <option value="high">HIGH</option>
          <option value="medium">MEDIUM</option>
          <option value="low">LOW</option>
        </select>
        {selected.length > 0 && (
          <button
            onClick={batchAcknowledge}
            className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm"
          >
            批量确认 ({selected.length})
          </button>
        )}
        <span className="text-gray-500 text-sm ml-auto">共 {total} 条</span>
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {alerts.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">✓</p>
            <p>暂无告警</p>
          </div>
        )}
        {alerts.map(alert => (
          <div
            key={alert.id}
            className={`border rounded-xl p-4 ${severityColor[alert.severity] ?? 'border-gray-800 bg-gray-900'} ${alert.status === 'acknowledged' ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.includes(alert.id)}
                onChange={() => toggleSelect(alert.id)}
                className="mt-1 accent-blue-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase">{alert.severity}</span>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{alert.type}</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {new Date(alert.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm font-medium text-white">{alert.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{alert.message}</p>
                {alert.agent_id && (
                  <p className="text-xs text-gray-600 mt-1">Agent: {alert.agent_id}</p>
                )}
              </div>
              {alert.status === 'open' && (
                <button
                  onClick={() => acknowledge(alert.id)}
                  className="shrink-0 text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                >
                  确认
                </button>
              )}
              {alert.status === 'acknowledged' && (
                <span className="shrink-0 text-xs text-gray-600">已确认</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
