'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { LayoutDashboard, Car, Plus, Users, BarChart2 } from 'lucide-react'

const mobileNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/przejazdy', label: 'Przejazdy', icon: Car },
  { href: '/przejazdy/dodaj', label: 'Dodaj', icon: Plus },
  { href: '/klienci', label: 'Klienci', icon: Users },
  { href: '/raporty', label: 'Raporty', icon: BarChart2 }
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200">
      <div className="flex">
        {mobileNavItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center py-2 gap-0.5',
                isActive ? 'text-primary-600' : 'text-slate-500'
              )}
            >
              {item.href === '/przejazdy/dodaj' ? (
                <div className="bg-primary-600 rounded-full p-2.5 -mt-5 shadow-md">
                  <Icon size={20} className="text-white" />
                </div>
              ) : (
                <Icon size={20} />
              )}
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
