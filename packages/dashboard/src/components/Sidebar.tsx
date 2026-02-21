'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/lib/api'
import clsx from 'clsx'

const navItems = [
  { href: '/dashboard', label: '总览', icon: '◉' },
  { href: '/dashboard/agents', label: 'Agent', icon: '⬡' },
  { href: '/dashboard/rules', label: '规则', icon: '⚙' },
  { href: '/dashboard/logs', label: '日志', icon: '≡' },
  { href: '/dashboard/alerts', label: '告警', icon: '⚠' },
  { href: '/dashboard/settings', label: '设置', icon: '⊙' },
]

export default function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="px-4 py-5 border-b border-gray-800">
        <span className="font-bold text-white text-lg">AgentGuard</span>
        <span className="ml-2 text-xs text-gray-500">v1.0</span>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === item.href
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            )}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-800">
        <button
          onClick={logout}
          className="w-full text-left text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          退出登录
        </button>
      </div>
    </aside>
  )
}
