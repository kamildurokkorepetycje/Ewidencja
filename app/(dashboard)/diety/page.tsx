'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Alert'
import { StatCard } from '@/components/ui/Card'
import { formatCurrency, formatDate, getMonthName } from '@/lib/utils/formatting'
import { Save, WalletCards, AlertTriangle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

type AllowanceType = 'state' | 'company'

interface ApiAllowance {
  id: string
  trip_id: string
  day: string
  allowance_type: AllowanceType
  amount: number | null
  is_paid: boolean
  paid_at: string | null
  payment_note: string | null
  is_settled: boolean
  settled_at: string | null
  notes: string | null
  trip?: {
    id: string
    date_from: string
    date_to: string
    card_number: string | null
    client?: {
      name: string
      city: string | null
    } | null
  } | null
}

interface AllowanceRow {
  key: string
  day: string
  trip_id: string
  trip?: ApiAllowance['trip']
  state?: ApiAllowance
  company?: ApiAllowance
  state_amount: string
  state_paid: boolean
  state_paid_at: string
  state_payment_note: string
  company_amount: string
}

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function toInputAmount(value: number | null) {
  return value == null ? '' : String(value)
}

function groupAllowances(items: ApiAllowance[]): AllowanceRow[] {
  const rows = new Map<string, AllowanceRow>()

  for (const item of items) {
    const key = `${item.trip_id}:${item.day}`
    const row = rows.get(key) ?? {
      key,
      day: item.day,
      trip_id: item.trip_id,
      trip: item.trip,
      state_amount: '',
      state_paid: false,
      state_paid_at: '',
      state_payment_note: '',
      company_amount: ''
    }

    if (item.allowance_type === 'state') {
      row.state = item
      row.state_amount = toInputAmount(item.amount)
      row.state_paid = item.is_paid
      row.state_paid_at = item.paid_at ? item.paid_at.slice(0, 10) : ''
      row.state_payment_note = item.payment_note ?? ''
    } else {
      row.company = item
      row.company_amount = toInputAmount(item.amount)
    }

    rows.set(key, row)
  }

  return [...rows.values()].sort((a, b) => b.day.localeCompare(a.day))
}

export default function DietyPage() {
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<AllowanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAllowances = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) })
      const res = await fetch(`/api/allowances?${params}`)
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Błąd pobierania diet')
      setRows(groupAllowances(payload.data ?? []))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania diet')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchAllowances()
  }, [fetchAllowances])

  const updateRow = (key: string, field: keyof AllowanceRow, value: string | boolean) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const allowances = rows.flatMap((row) => {
        const updates = []
        if (row.state) {
          updates.push({
            id: row.state.id,
            amount: row.state_amount,
            is_paid: row.state_paid,
            paid_at: row.state_paid_at || null,
            payment_note: row.state_payment_note || null
          })
        }
        if (row.company) {
          updates.push({
            id: row.company.id,
            amount: row.company_amount
          })
        }
        return updates
      })

      const res = await fetch('/api/allowances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowances })
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Błąd zapisu diet')
      toast.success('Diety zapisane')
      fetchAllowances()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu diet')
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(() => {
    const stateTotal = rows.reduce((sum, row) => sum + (parseFloat(row.state_amount) || 0), 0)
    const companyTotal = rows.reduce((sum, row) => sum + (parseFloat(row.company_amount) || 0), 0)
    const missing = rows.filter((row) => !row.state_amount || !row.company_amount).length
    const stateUnpaid = rows.filter((row) => row.state_amount && !row.state_paid).length
    return { stateTotal, companyTotal, missing, stateUnpaid }
  }, [rows])

  return (
    <div>
      <Header
        title="Diety"
        actions={
          <Button size="sm" onClick={handleSave} loading={saving} disabled={loading}>
            <Save size={16} />
            Zapisz
          </Button>
        }
      />
      <div className="p-4 lg:p-6 space-y-5">
        <div className="surface p-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600 mb-1 block">Miesiąc</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {MONTHS.map((m) => <option key={m} value={m}>{getMonthName(m)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600 mb-1 block">Rok</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Państwowe" value={formatCurrency(stats.stateTotal)} icon={<WalletCards size={20} />} color="green" />
          <StatCard title="Firmowe" value={formatCurrency(stats.companyTotal)} icon={<WalletCards size={20} />} color="blue" />
          <StatCard title="Do uzupełnienia" value={stats.missing} icon={<AlertTriangle size={20} />} color="yellow" />
          <StatCard title="Państwowe do wypłaty" value={stats.stateUnpaid} icon={<CheckCircle2 size={20} />} color="purple" />
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dzień</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Przejazd</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Państwowa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Firmowa</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="text-center py-10"><Spinner /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-10 text-slate-400">Brak diet w wybranym miesiącu</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-slate-900">{formatDate(row.day)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.trip?.client?.name ?? 'Bez klienta'}</p>
                      <p className="text-xs text-slate-400">{row.trip?.card_number ?? 'bez POP'}</p>
                    </td>
                    <td className="px-4 py-3 min-w-[260px]">
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={row.state_amount}
                            onChange={(e) => updateRow(row.key, 'state_amount', e.target.value)}
                            className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                            placeholder="0.00"
                          />
                          <span className="self-center text-xs text-slate-400">PLN</span>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded accent-emerald-600"
                            checked={row.state_paid}
                            onChange={(e) => updateRow(row.key, 'state_paid', e.target.checked)}
                          />
                          Wypłacona do ręki
                        </label>
                        {row.state_paid && (
                          <input
                            type="date"
                            value={row.state_paid_at}
                            onChange={(e) => updateRow(row.key, 'state_paid_at', e.target.value)}
                            className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-[220px]">
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={row.company_amount}
                            onChange={(e) => updateRow(row.key, 'company_amount', e.target.value)}
                            className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                            placeholder="0.00"
                          />
                          <span className="self-center text-xs text-slate-400">PLN</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
