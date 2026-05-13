'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import {
  LayoutDashboard,
  Car,
  Users,
  Fuel,
  Hotel,
  BarChart2,
  Settings,
  LogOut,
  X,
  Plus,
  ChevronRight,
} from 'lucide-react'

const navGroups = [
  {
    label: 'Główne',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/przejazdy', label: 'Przejazdy', icon: Car },
    ]
  },
  {
    label: 'Zarządzanie',
    items: [
      { href: '/klienci', label: 'Klienci', icon: Users },
      { href: '/paliwo', label: 'Paliwo i faktury', icon: Fuel },
      { href: '/hotele', label: 'Hotele', icon: Hotel },
    ]
  },
  {
    label: 'Analityka',
    items: [
      { href: '/raporty', label: 'Raporty', icon: BarChart2 },
    ]
  }
]

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  kierowca: 'Kierowca',
  podgląd: 'Podgląd',
}

interface SidebarProps {
  onClose?: () => void
  mobile?: boolean
}

export function Sidebar({ onClose, mobile }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [userName, setUserName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [dateLabel, setDateLabel] = useState<string | null>(null)

  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }))
  }, [])

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? null)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, role')
        .eq('user_id', user.id)
        .single()
      if (profile) {
        setUserName(profile.full_name)
        setUserRole(profile.role)
      }
    }
    loadUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex h-full flex-col w-64 bg-slate-950">
      {/* ── Logo ── */}
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-500 flex items-center justify-center shadow-sm">
            <Car size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Ewidencja</p>
            <p className="text-xs text-slate-400 leading-tight">Przejazdów</p>
          </div>
        </div>
        {mobile && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={17} />
          </button>
        )}
      </div>

      {/* ── Date strip ── */}
      <div className="mx-3 mb-4 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">
        <p className="text-xs text-slate-400 capitalize">{dateLabel ?? '\u00a0'}</p>
      </div>

      {/* ── CTA: Dodaj przejazd ── */}
      <div className="px-3 mb-4">
        <Link
          href="/przejazdy/dodaj"
          onClick={onClose}
          className={cn(
            'flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all w-full',
            pathname === '/przejazdy/dodaj'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'bg-primary-500/10 text-primary-300 hover:bg-primary-500 hover:text-white'
          )}
        >
          <div className="w-6 h-6 rounded-md bg-white/15 flex items-center justify-center shrink-0">
            <Plus size={14} />
          </div>
          Dodaj przejazd
          <ChevronRight size={14} className="ml-auto opacity-60" />
        </Link>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group',
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                    )}
                  >
                    {/* Active left border */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary-400" />
                    )}
                    <div className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-md shrink-0 transition-colors',
                      isActive
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'
                    )}>
                      <Icon size={15} />
                    </div>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer: Settings + User ── */}
      <div className="px-3 pt-3 pb-4 border-t border-slate-800 space-y-0.5 mt-3">
        <Link
          href="/ustawienia"
          onClick={onClose}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
            pathname.startsWith('/ustawienia')
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
          )}
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300 transition-colors shrink-0">
            <Settings size={15} />
          </div>
          Ustawienia
        </Link>

        {/* User profile */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mt-1">
          <div className="w-8 h-8 rounded-md bg-primary-500 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            {getInitials(userName ?? userEmail ?? null)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">
              {userName ?? userEmail ?? 'Użytkownik'}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {userRole ? roleLabels[userRole] ?? userRole : ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Wyloguj się"
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition shrink-0"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
