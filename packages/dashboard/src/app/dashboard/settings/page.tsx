'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Settings {
  proxy_port: string
  proxy_bind: string
  proxy_ip_whitelist: string
  log_retention_days: string
  dashboard_session_timeout: string
  license_key: string
  license_tier: string
  license_status: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Partial<Settings>>({})
  const [saved, setSaved] = useState(false)
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseMsg, setLicenseMsg] = useState('')
  const [licenseOk, setLicenseOk] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [aliases, setAliases] = useState<{ id: string; alias: string; target_url: string; builtin: number }[]>([])
  const [aliasForm, setAliasForm] = useState({ alias: '', target_url: '' })
  const [dbInfo, setDbInfo] = useState<{ size_mb: number; transactions: number; alerts: number } | null>(null)

  async function load() {
    const data = await apiFetch<Settings>('/settings')
    setSettings(data)
    const sa = await apiFetch<{ aliases: typeof aliases }>('/service-aliases')
    setAliases(sa.aliases)
  }

  useEffect(() => { load() }, [])

  async function saveSettings() {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(settings) })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function activateLicense() {
    setLicenseMsg('')
    try {
      const res = await apiFetch<{ plan: string; message: string }>('/license/activate', {
        method: 'POST',
        body: JSON.stringify({ key: licenseKey }),
      })
      setLicenseMsg(`✓ ${res.message}（${res.plan}）`)
      setLicenseOk(true)
      load()
    } catch (err) {
      setLicenseMsg(`✗ ${(err as Error).message}`)
      setLicenseOk(false)
    }
  }

  async function changePassword() {
    setPwMsg('')
    if (pwForm.next !== pwForm.confirm) { setPwMsg('两次密码不一致'); return }
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current: pwForm.current, next: pwForm.next }),
      })
      setPwMsg('✓ 密码已更新')
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setPwMsg(`✗ ${(err as Error).message}`)
    }
  }

  async function addAlias() {
    if (!aliasForm.alias || !aliasForm.target_url) return
    await apiFetch('/service-aliases', { method: 'POST', body: JSON.stringify(aliasForm) })
    setAliasForm({ alias: '', target_url: '' })
    load()
  }

  async function deleteAlias(id: string) {
    await apiFetch(`/service-aliases/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-white">设置</h1>

      {/* License */}
      <Section title="授权与版本">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400">当前版本</span>
            <span className="text-white font-medium capitalize">{settings.license_tier ?? 'free'}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${settings.license_status === 'active' ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
              {settings.license_status === 'active' ? '已激活' : '未激活'}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={licenseKey}
              onChange={e => setLicenseKey(e.target.value)}
              placeholder="AG-XXXX-XXXX-XXXX-XXXX"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={activateLicense}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              激活
            </button>
          </div>
          {licenseMsg && (
            <p className={`text-xs ${licenseOk ? 'text-green-400' : 'text-red-400'}`}>{licenseMsg}</p>
          )}
        </div>
      </Section>

      {/* Security */}
      <Section title="安全认证">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">会话超时（分钟）</label>
            <input
              value={settings.dashboard_session_timeout ?? '1440'}
              onChange={e => setSettings(s => ({ ...s, dashboard_session_timeout: e.target.value }))}
              type="number"
              className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
          </div>
          <div className="border-t border-gray-800 pt-3 space-y-2">
            <p className="text-xs text-gray-400 font-medium">修改 Dashboard 密码</p>
            <input
              value={pwForm.current}
              onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              type="password"
              placeholder="当前密码"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
            <input
              value={pwForm.next}
              onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
              type="password"
              placeholder="新密码"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
            <input
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              type="password"
              placeholder="确认新密码"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
            <button onClick={changePassword} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm">
              更新密码
            </button>
            {pwMsg && <p className={`text-xs ${pwMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{pwMsg}</p>}
          </div>
        </div>
      </Section>

      {/* Proxy config */}
      <Section title="代理配置">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">代理端口</label>
              <input
                value={settings.proxy_port ?? '8080'}
                onChange={e => setSettings(s => ({ ...s, proxy_port: e.target.value }))}
                type="number"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">绑定地址</label>
              <input
                value={settings.proxy_bind ?? '127.0.0.1'}
                onChange={e => setSettings(s => ({ ...s, proxy_bind: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">IP 白名单（逗号分隔，留空不限制）</label>
            <input
              value={settings.proxy_ip_whitelist ?? ''}
              onChange={e => setSettings(s => ({ ...s, proxy_ip_whitelist: e.target.value }))}
              placeholder="127.0.0.1,192.168.1.0/24"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
          </div>
        </div>
      </Section>

      {/* Service aliases */}
      <Section title="服务别名">
        <div className="space-y-3">
          <div className="space-y-2">
            {aliases.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <code className="text-blue-400 w-28 shrink-0">{a.alias}</code>
                <span className="text-gray-400 flex-1 truncate">{a.target_url}</span>
                {a.builtin ? (
                  <span className="text-xs text-gray-600">内置</span>
                ) : (
                  <button onClick={() => deleteAlias(a.id)} className="text-xs text-red-500 hover:text-red-400">删除</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-gray-800">
            <input
              value={aliasForm.alias}
              onChange={e => setAliasForm(f => ({ ...f, alias: e.target.value }))}
              placeholder="别名 (如 my-api)"
              className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
            <input
              value={aliasForm.target_url}
              onChange={e => setAliasForm(f => ({ ...f, target_url: e.target.value }))}
              placeholder="目标 URL (如 https://api.example.com)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
            <button onClick={addAlias} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm">
              添加
            </button>
          </div>
        </div>
      </Section>

      {/* Data management */}
      <Section title="数据管理">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">日志保留天数</label>
            <input
              value={settings.log_retention_days ?? '7'}
              onChange={e => setSettings(s => ({ ...s, log_retention_days: e.target.value }))}
              type="number"
              min="1"
              max="365"
              className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
          </div>
        </div>
      </Section>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveSettings}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium"
        >
          保存设置
        </button>
        {saved && <span className="text-green-400 text-sm">✓ 已保存</span>}
      </div>

      {/* Danger zone */}
      <Section title="危险操作" danger>
        <div className="space-y-3">
          <DangerButton
            label="清空所有日志"
            confirm="确认清空所有请求日志？此操作不可恢复。"
            onClick={async () => { await apiFetch('/settings/clear-logs', { method: 'POST' }); alert('日志已清空') }}
          />
          <DangerButton
            label="重置所有规则"
            confirm="确认重置所有规则为默认值？"
            onClick={async () => { await apiFetch('/settings/reset-rules', { method: 'POST' }); alert('规则已重置') }}
          />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div className={`bg-gray-900 border rounded-xl p-5 space-y-4 ${danger ? 'border-red-900/50' : 'border-gray-800'}`}>
      <h2 className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-gray-300'}`}>{title}</h2>
      {children}
    </div>
  )
}

function DangerButton({ label, confirm: confirmMsg, onClick }: { label: string; confirm: string; onClick: () => void }) {
  return (
    <button
      onClick={() => { if (window.confirm(confirmMsg)) onClick() }}
      className="text-sm text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 px-4 py-2 rounded-lg border border-red-900/50"
    >
      {label}
    </button>
  )
}
