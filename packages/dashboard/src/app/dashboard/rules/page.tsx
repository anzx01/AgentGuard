'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Rule {
  id: string
  rule_set_id: string
  type: string
  params: Record<string, unknown>
  enabled: boolean
  priority: number
  description: string | null
}

interface RuleSet {
  id: string
  name: string
  description: string | null
}

const RULE_TYPES = [
  { value: 'daily_budget', label: '每日预算上限', paramKey: 'limit', paramLabel: '金额 ($)', type: 'number' },
  { value: 'monthly_budget', label: '每月预算上限', paramKey: 'limit', paramLabel: '金额 ($)', type: 'number' },
  { value: 'per_call_limit', label: '单次调用上限', paramKey: 'limit', paramLabel: '金额 ($)', type: 'number' },
  { value: 'rate_limit', label: '频率限制', paramKey: 'max', paramLabel: '次数/窗口', type: 'number' },
  { value: 'domain_whitelist', label: '域名白名单', paramKey: 'domains', paramLabel: '域名列表 (逗号分隔)', type: 'text' },
  { value: 'domain_blacklist', label: '域名黑名单', paramKey: 'domains', paramLabel: '域名列表 (逗号分隔)', type: 'text' },
  { value: 'method_restriction', label: '方法限制', paramKey: 'methods', paramLabel: '方法列表 (逗号分隔)', type: 'text' },
  { value: 'time_window_block', label: '时间窗口封锁', paramKey: 'start', paramLabel: '开始小时 (0-23)', type: 'number' },
]

const ruleTypeLabel = (type: string) => RULE_TYPES.find(r => r.value === type)?.label ?? type

export default function RulesPage() {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([])
  const [rules, setRules] = useState<Record<string, Rule[]>>({})
  const [activeSet, setActiveSet] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'daily_budget', paramValue: '', priority: '50', description: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadRuleSets() {
    const data = await apiFetch<{ ruleSets: RuleSet[] }>('/rule-sets')
    setRuleSets(data.ruleSets)
    if (data.ruleSets.length > 0 && !activeSet) {
      setActiveSet(data.ruleSets[0].id)
    }
  }

  async function loadRules(setId: string) {
    const data = await apiFetch<{ rules: Rule[] }>(`/rule-sets/${setId}/rules`)
    setRules(r => ({ ...r, [setId]: data.rules }))
  }

  useEffect(() => { loadRuleSets() }, [])
  useEffect(() => { if (activeSet) loadRules(activeSet) }, [activeSet])

  async function createRule(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const ruleType = RULE_TYPES.find(r => r.value === form.type)!
      let params: Record<string, unknown> = {}
      if (ruleType.type === 'number') {
        params[ruleType.paramKey] = Number(form.paramValue)
        if (form.type === 'rate_limit') params.window_seconds = 3600
        if (form.type === 'time_window_block') params.end = (Number(form.paramValue) + 8) % 24
      } else {
        params[ruleType.paramKey] = form.paramValue.split(',').map(s => s.trim()).filter(Boolean)
      }
      await apiFetch(`/rule-sets/${activeSet}/rules`, {
        method: 'POST',
        body: JSON.stringify({
          name: form.type,
          type: form.type,
          params,
          priority: Number(form.priority),
          description: form.description || null,
        }),
      })
      setShowForm(false)
      setForm({ type: 'daily_budget', paramValue: '', priority: '50', description: '' })
      loadRules(activeSet)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleRule(rule: Rule) {
    await apiFetch(`/rules/${rule.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_enabled: !rule.enabled }),
    })
    loadRules(activeSet)
  }

  async function deleteRule(ruleId: string) {
    if (!confirm('确认删除此规则？')) return
    await apiFetch(`/rules/${ruleId}`, { method: 'DELETE' })
    loadRules(activeSet)
  }

  const currentRules = rules[activeSet] ?? []
  const selectedType = RULE_TYPES.find(r => r.value === form.type)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">规则配置</h1>

      {/* Rule set tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-0">
        {ruleSets.map(rs => (
          <button
            key={rs.id}
            onClick={() => setActiveSet(rs.id)}
            className={`px-4 py-2 text-sm rounded-t-lg border-b-2 transition-colors ${
              activeSet === rs.id
                ? 'border-blue-500 text-blue-400 bg-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {rs.name}
          </button>
        ))}
      </div>

      {activeSet && (
        <>
          {/* Add rule button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {currentRules.length} 条规则
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              + 添加规则
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-medium text-gray-300 mb-4">新建规则</h2>
              <form onSubmit={createRule} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">规则类型 *</label>
                    <select
                      value={form.type}
                      onChange={e => setForm(f => ({ ...f, type: e.target.value, paramValue: '' }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                    >
                      {RULE_TYPES.map(rt => (
                        <option key={rt.value} value={rt.value}>{rt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {selectedType?.paramLabel ?? '参数'} *
                    </label>
                    <input
                      value={form.paramValue}
                      onChange={e => setForm(f => ({ ...f, paramValue: e.target.value }))}
                      type={selectedType?.type ?? 'text'}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">优先级 (数字越小越高)</label>
                    <input
                      value={form.priority}
                      onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                      type="number"
                      min="1"
                      max="100"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">描述</label>
                    <input
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                      placeholder="可选"
                    />
                  </div>
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

          {/* Rules list */}
          {currentRules.length === 0 && !showForm && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">⚙</p>
              <p>暂无规则，点击"添加规则"开始配置</p>
            </div>
          )}

          <div className="space-y-2">
            {currentRules
              .sort((a, b) => a.priority - b.priority)
              .map(rule => (
                <div
                  key={rule.id}
                  className={`bg-gray-900 border rounded-xl p-4 ${rule.enabled ? 'border-gray-800' : 'border-gray-800 opacity-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-6 text-center">{rule.priority}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{ruleTypeLabel(rule.type)}</span>
                          {!rule.enabled && (
                            <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">已禁用</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {JSON.stringify(rule.params)}
                          {rule.description && ` — ${rule.description}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRule(rule)}
                        className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                      >
                        {rule.enabled ? '禁用' : '启用'}
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="text-xs px-3 py-1 rounded-lg bg-red-900/50 hover:bg-red-900 text-red-400"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
