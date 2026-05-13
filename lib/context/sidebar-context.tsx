'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface SidebarContextType {
  open: () => void
}

const SidebarContext = createContext<SidebarContextType>({ open: () => {} })

export function SidebarProvider({ children }: { children: ReactNode }) {
  // State lives here so Header can trigger it via context
  return <SidebarContext.Provider value={{ open: () => {} }}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  return useContext(SidebarContext)
}

export { SidebarContext }
