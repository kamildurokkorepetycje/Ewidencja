'use client'

import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { SidebarProvider, useSidebar } from '@/lib/context/sidebar-context'

function DashboardShell({ children }: { children: React.ReactNode }) {
  const sidebar = useSidebar()

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar />
      </div>

      {sidebar.isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={sidebar.close} />
          <div className="relative h-full w-64">
            <Sidebar mobile onClose={sidebar.close} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardShell>{children}</DashboardShell>
    </SidebarProvider>
  )
}
