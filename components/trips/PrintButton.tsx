'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function PrintButton() {
  return <Button type="button" variant="outline" size="sm" onClick={() => window.print()}><Printer size={15} /> Drukuj / PDF</Button>
}