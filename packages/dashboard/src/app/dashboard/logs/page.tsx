'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Log {
  id: string
  agent_name: string | null
  target_service: string
  target_url: string
  method: string
  decision: string
  block_reason: string | null
  latency_ms: number | null
  estimated_cost: number
  response_status: number | null
  timestamp: string
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ status: '', service: '', q: '' })
  const [selected, setSelected] = useState<Log | null>(null)
  const pageSize = 50

  async function load() {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(filters.status && { status: filters.status }),
      ...(filters.service && { service: filters.service }),
      ...(filters.q && { q: filters.q }),
    })
    const data = await apiFetch<{ total: number; data: Log[] }>(`/logs?${params}`)
    setLogs(data.data)
    setTotal(data.total)
  }

  useEffect(() => { load() }, [page, filters])

  const decisionStyle = (d: string) =>
    d === 'allow' ? 'text-green-400' : d === 'block' ? 'text-red-400' : 'text-orange-400'

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">实时日志</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.status}
          onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1) }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none"
        >
          <option value="">全部状态</option>
          <option value="allow">通过</option>
          <option value="block">阻断</option>
          <option value="error">错误</option>
        </select>
        <input
          value={filters.service}
          onChange={e => { setFilters(f => ({ ...f, service: e.target.value })); setPage(1) }}
          placeholder="服务名称..."
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none w-36"
        />
        <input
          value={filters.q}
          onChange={e => { setFilters(f => ({ ...f, q: e.target.value })); setPage(1) }}
          placeholder="搜索 URL 或 Agent..."
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none w-56"
        />
        <button onClick={load} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm">
          刷新
        </button>
        <span className="text-gray-500 text-sm self-center">共 {total} 条</span>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-800 bg-gray-900/80">
                <th className="text-left px-4 py-3 font-normal">时间</th>
                <th className="text-left px-4 py-3 font-normal">Agent</th>
                <th className="text-left px-4 py-3 font-normal">服务</th>
                <th className="text-left px-4 py-3 font-normal">方法</th>
                <th className="text-left px-4 py-3 font-normal">状态</th>
                <th className="text-right px-4 py-3 font-normal">延迟</th>
                <th className="text-right px-4 py-3 font-normal">费用</th>
                <th className="text-right px-4 py-3 font-normal">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {logs.map(log => (
                <tr
                  key={log.id}
                  className={`hover:bg-gray-800/50 ${log.decision === 'block' ? 'bg-red-950/10' : ''}`}
                >
                  <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-300">{log.agent_name ?? '-'}</td>
                  <td className="px-4 py-2.5 text-gray-300">{log.target_service}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{log.method}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium ${decisionStyle(log.decision)}`}>
                      {log.decision === 'allow' ? '✓ 通过' : log.decision === 'block' ? '✗ 阻断' : '⚠ 错误'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                    {log.latency_ms != null ? `${log.latency_ms.toFixed(0)}ms` : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                    {log.estimated_cost > 0 ? `$${log.estimated_cost.toFixed(3)}` : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setSelected(log)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <p className="text-center text-gray-500 py-10">暂无日志记录</p>
          )}
        </div>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 text-sm disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-gray-400 text-sm">第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / pageSize)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 text-sm disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md bg-gray-900 border-l border-gray-800 h-full overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">请求详情</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3 text-sm">
              <Row label="事务 ID" value={selected.id} mono />
              <Row label="时间" value={new Date(selected.timestamp).toLocaleString()} />
              <Row label="Agent" value={selected.agent_name ?? '-'} />
              <Row label="目标服务" value={selected.target_service} />
              <Row label="目标 URL" value={selected.target_url} mono />
              <Row label="方法" value={selected.method} />
              <Row label="响应状态" value={selected.response_status ? String(selected.response_status) : '-'} />
              <Row label="延迟" value={selected.latency_ms != null ? `${selected.latency_ms.toFixed(1)}ms` : '-'} />
              <Row label="预估费用" value={selected.estimated_cost > 0 ? `$${selected.estimated_cost.toFixed(4)}` : '-'} />
              <div className="border-t border-gray-800 pt-3">
                <p className="text-gray-500 text-xs mb-2">决策信息</p>
                <Row
                  label="决策"
                  value={selected.decision === 'allow' ? '✓ 通过' : '✗ 阻断'}
                  valueClass={selected.decision === 'allow' ? 'text-green-400' : 'text-red-400'}
                />
                {selected.block_reason && <Row label="阻断原因" value={selected.block_reason} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-gray-500 w-24 shrink-0">{label}</span>
      <span className={`text-gray-200 break-all ${mono ? 'font-mono text-xs' : ''} ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}
