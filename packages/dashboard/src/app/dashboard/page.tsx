'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Summary {
  todaySpend: number
  monthSpend: number
  todayCalls: number
  todayBlocked: number
  byAgent: { agentId: string; name: string; todaySpend: number }[]
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: string
}

function StatCard({ label, value, sub, color = 'text-white' }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [alerts, setAlerts] = useState<{ id: string; severity: string; title: string; created_at: string }[]>([])
  const [logs, setLogs] = useState<{ id: string; agent_name: string; target_service: string; decision: string; latency_ms: number; timestamp: string }[]>([])

  useEffect(() => {
    apiFetch<Summary>('/budget/summary').then(setSummary).catch(() => {})
    apiFetch<{ data: typeof alerts }>('/alerts?status=open&pageSize=5').then(r => setAlerts(r.data)).catch(() => {})
    apiFetch<{ data: typeof logs }>('/logs?pageSize=20').then(r => setLogs(r.data)).catch(() => {})
  }, [])

  const severityColor: Record<string, string> = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-gray-400',
    info: 'text-blue-400',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">总览</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="今日花费" value={`$${(summary?.todaySpend ?? 0).toFixed(2)}`} color="text-green-400" />
        <StatCard label="本月花费" value={`$${(summary?.monthSpend ?? 0).toFixed(2)}`} />
        <StatCard label="今日请求" value={summary?.todayCalls ?? 0} />
        <StatCard label="今日阻断" value={summary?.todayBlocked ?? 0} color={summary?.todayBlocked ? 'text-red-400' : 'text-white'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent status */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">Agent 状态</h2>
          {summary?.byAgent.length === 0 && (
            <p className="text-gray-500 text-sm">暂无 Agent，请先创建</p>
          )}
          <div className="space-y-3">
            {summary?.byAgent.map(a => (
              <div key={a.agentId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-200">{a.name}</span>
                </div>
                <span className="text-sm text-gray-400">${a.todaySpend.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent alerts */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">最近告警</h2>
          {alerts.length === 0 && <p className="text-gray-500 text-sm">暂无未处理告警</p>}
          <div className="space-y-3">
            {alerts.map(a => (
              <div key={a.id} className="flex items-start gap-2">
                <span className={`text-xs font-bold uppercase mt-0.5 ${severityColor[a.severity] ?? 'text-gray-400'}`}>
                  {a.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{a.title}</p>
                  <p className="text-xs text-gray-500">{new Date(a.created_at).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent requests */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-medium text-gray-300 mb-4">最近请求</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-800">
                <th className="text-left pb-2 font-normal">时间</th>
                <th className="text-left pb-2 font-normal">Agent</th>
                <th className="text-left pb-2 font-normal">服务</th>
                <th className="text-left pb-2 font-normal">状态</th>
                <th className="text-right pb-2 font-normal">延迟</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-800/50">
                  <td className="py-2 text-gray-500 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</td>
                  <td className="py-2 text-gray-300">{log.agent_name ?? '-'}</td>
                  <td className="py-2 text-gray-300">{log.target_service}</td>
                  <td className="py-2">
                    <span className={`text-xs font-medium ${log.decision === 'allow' ? 'text-green-400' : 'text-red-400'}`}>
                      {log.decision === 'allow' ? '✓ 通过' : '✗ 阻断'}
                    </span>
                  </td>
                  <td className="py-2 text-right text-gray-500 text-xs">{log.latency_ms ? `${log.latency_ms.toFixed(0)}ms` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <p className="text-gray-500 text-sm text-center py-4">暂无请求记录</p>}
        </div>
      </div>
    </div>
  )
}
