'use client'

import { Menu } from 'lucide-react'
import { useSidebar } from '@/lib/context/sidebar-context'

interface HeaderProps {
  title: string
  onMenuClick?: () => void
  actions?: React.ReactNode
}

export function Header({ title, onMenuClick, actions }: HeaderProps) {
  const sidebar = useSidebar()
  const handleMenuClick = onMenuClick ?? sidebar.open

  return (
    <header className="bg-white/95 backdrop-blur border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center gap-4 sticky top-0 z-30">
      {/* Mobile menu button */}
      <button
        onClick={handleMenuClick}
        className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="Otwórz menu"
      >
        <Menu size={20} />
      </button>

      <h1 className="text-lg font-semibold text-slate-950 flex-1 tracking-tight">{title}</h1>

      <div className="flex items-center gap-2">
        {actions}
      </div>
    </header>
  )
}
