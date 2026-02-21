'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Agent {
  id: string
  name: string
  description: string | null
  status: string
  created_at: string
  last_seen_at: string | null
  token_prefix: string | null
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [newToken, setNewToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const data = await apiFetch<{ agents: Agent[] }>('/agents')
    setAgents(data.agents)
  }

  useEffect(() => { load() }, [])

  async function createAgent(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch<{ id: string; name: string; token: string }>('/agents', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setNewToken(res.token)
      setShowForm(false)
      setForm({ name: '', description: '' })
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function togglePause(agent: Agent) {
    const action = agent.status === 'active' ? 'pause' : 'resume'
    await apiFetch(`/agents/${agent.id}/${action}`, { method: 'POST' })
    load()
  }

  async function deleteAgent(id: string) {
    if (!confirm('确认删除此 Agent？')) return
    await apiFetch(`/agents/${id}`, { method: 'DELETE' })
    load()
  }

  async function rotateToken(id: string) {
    const res = await apiFetch<{ token: string }>(`/agents/${id}/rotate-token`, { method: 'POST' })
    setNewToken(res.token)
  }

  const statusColor: Record<string, string> = {
    active: 'bg-green-500',
    paused: 'bg-yellow-500',
    blocked: 'bg-red-500',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Agent 管理</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + 新建 Agent
        </button>
      </div>

      {/* New token display */}
      {newToken && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
          <p className="text-yellow-300 text-sm font-medium mb-2">⚠ Agent Token（仅显示一次，请立即保存）</p>
          <code className="text-yellow-100 text-xs break-all bg-yellow-900/50 px-3 py-2 rounded block">{newToken}</code>
          <button onClick={() => setNewToken(null)} className="mt-2 text-xs text-yellow-500 hover:text-yellow-300">关闭</button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">新建 Agent</h2>
          <form onSubmit={createAgent} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">名称 *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="my-agent"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">描述</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="用途描述"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">
                {loading ? '创建中...' : '创建'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Agent list */}
      {agents.length === 0 && !showForm && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">⬡</p>
          <p>暂无 Agent，点击"新建 Agent"开始</p>
        </div>
      )}

      <div className="space-y-3">
        {agents.map(agent => (
          <div key={agent.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${statusColor[agent.status] ?? 'bg-gray-500'}`} />
                <div>
                  <p className="font-medium text-white">{agent.name}</p>
                  {agent.description && <p className="text-xs text-gray-500 mt-0.5">{agent.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePause(agent)}
                  className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                >
                  {agent.status === 'active' ? '暂停' : '恢复'}
                </button>
                <button
                  onClick={() => rotateToken(agent.id)}
                  className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                >
                  重置 Token
                </button>
                <button
                  onClick={() => deleteAgent(agent.id)}
                  className="text-xs px-3 py-1 rounded-lg bg-red-900/50 hover:bg-red-900 text-red-400"
                >
                  删除
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span>Token: <code className="text-gray-400">{agent.token_prefix ?? 'ag_live_'}...</code></span>
              <span>创建于 {new Date(agent.created_at).toLocaleDateString()}</span>
              {agent.last_seen_at && <span>最后活跃 {new Date(agent.last_seen_at).toLocaleString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
