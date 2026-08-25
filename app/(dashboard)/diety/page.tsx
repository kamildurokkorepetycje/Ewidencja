'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Alert'
import { StatCard } from '@/components/ui/Card'
import { formatCurrency, formatDate, getMonthName } from '@/lib/utils/formatting'
import { Check, CheckCircle2, ChevronDown, ChevronUp, Clock3, Save, WalletCards } from 'lucide-react'
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
    client?: { name: string; city: string | null } | null
  } | null
}

interface AllowanceDay {
  key: string
  day: string
  state?: ApiAllowance
  company?: ApiAllowance
  stateAmount: string
  companyAmount: string
}

interface Delegation {
  tripId: string
  trip: ApiAllowance['trip']
  days: AllowanceDay[]
}

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, index) => currentYear - index)
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

function amountInput(value: number | null) {
  return value == null ? '' : String(value)
}

function groupDelegations(items: ApiAllowance[]): Delegation[] {
  const delegations = new Map<string, Delegation>()

  for (const allowance of items) {
    const delegation = delegations.get(allowance.trip_id) ?? {
      tripId: allowance.trip_id,
      trip: allowance.trip,
      days: []
    }
    const day = delegation.days.find((item) => item.day === allowance.day) ?? {
      key: `${allowance.trip_id}:${allowance.day}`,
      day: allowance.day,
      stateAmount: '',
      companyAmount: ''
    }

    if (allowance.allowance_type === 'state') {
      day.state = allowance
      day.stateAmount = amountInput(allowance.amount)
    } else {
      day.company = allowance
      day.companyAmount = amountInput(allowance.amount)
    }

    if (!delegation.days.some((item) => item.key === day.key)) delegation.days.push(day)
    delegations.set(allowance.trip_id, delegation)
  }

  return [...delegations.values()]
    .map((delegation) => ({ ...delegation, days: delegation.days.sort((a, b) => a.day.localeCompare(b.day)) }))
    .sort((a, b) => (b.trip?.date_from ?? '').localeCompare(a.trip?.date_from ?? ''))
}

export default function DietyPage() {
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [delegations, setDelegations] = useState<Delegation[]>([])
  const [openTrips, setOpenTrips] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingTripId, setSavingTripId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchAllowances = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) })
      const response = await fetch(`/api/allowances?${params}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Błąd pobierania diet')
      const grouped = groupDelegations(payload.data ?? [])
      setDelegations(grouped)
      setOpenTrips((current) => current.size > 0 ? current : new Set(grouped.length === 1 ? [grouped[0].tripId] : []))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Błąd pobierania diet')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchAllowances() }, [fetchAllowances])

  const updateDay = (tripId: string, dayKey: string, field: 'stateAmount' | 'companyAmount', value: string) => {
    setDelegations((current) => current.map((delegation) => delegation.tripId !== tripId ? delegation : {
      ...delegation,
      days: delegation.days.map((day) => day.key === dayKey ? { ...day, [field]: value } : day)
    }))
  }

  const saveDelegation = async (delegation: Delegation, approveState: boolean) => {
    const allowances = delegation.days.flatMap((day) => {
      const updates: Array<Record<string, unknown>> = []
      if (day.state) {
        updates.push({
          id: day.state.id,
          amount: day.stateAmount,
          ...(approveState ? { is_paid: true, paid_at: new Date().toISOString() } : {})
        })
      }
      if (day.company) updates.push({ id: day.company.id, amount: day.companyAmount })
      return updates
    })

    setSavingTripId(delegation.tripId)
    try {
      const response = await fetch('/api/allowances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowances })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Błąd zapisu diet')
      toast.success(approveState ? 'Diety państwowe zatwierdzone do wypłaty' : 'Delegacja zapisana')
      await fetchAllowances()
    } catch (reason: unknown) {
      toast.error(reason instanceof Error ? reason.message : 'Błąd zapisu diet')
    } finally {
      setSavingTripId(null)
    }
  }

  const toggleTrip = (tripId: string) => {
    setOpenTrips((current) => {
      const next = new Set(current)
      if (next.has(tripId)) next.delete(tripId)
      else next.add(tripId)
      return next
    })
  }

  const stats = useMemo(() => {
    const days = delegations.flatMap((delegation) => delegation.days)
    const stateTotal = days.reduce((sum, day) => sum + (Number(day.stateAmount.replace(',', '.')) || 0), 0)
    const companyTotal = days.reduce((sum, day) => sum + (Number(day.companyAmount.replace(',', '.')) || 0), 0)
    const unpaid = days.filter((day) => day.state?.amount && !day.state.is_paid).length
    return { stateTotal, companyTotal, unpaid, trips: delegations.length }
  }, [delegations])

  return (
    <div>
      <Header title="Diety" />
      <div className="p-4 lg:p-6 space-y-5">
        <div className="surface flex flex-wrap items-end gap-3 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Miesiąc</span>
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {MONTHS.map((item) => <option key={item} value={item}>{getMonthName(item)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Rok</span>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {YEARS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard title="Delegacje" value={stats.trips} icon={<WalletCards size={20} />} color="blue" />
          <StatCard title="Państwowe" value={formatCurrency(stats.stateTotal)} icon={<WalletCards size={20} />} color="green" />
          <StatCard title="Firmowe" value={formatCurrency(stats.companyTotal)} icon={<WalletCards size={20} />} color="purple" />
          <StatCard title="Do wypłaty" value={stats.unpaid} icon={<Clock3 size={20} />} color="yellow" />
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="surface flex justify-center py-12"><Spinner size="lg" /></div>
        ) : delegations.length === 0 ? (
          <div className="surface py-12 text-center text-sm text-slate-400">Brak diet w wybranym miesiącu</div>
        ) : (
          <div className="space-y-3">
            {delegations.map((delegation) => {
              const isOpen = openTrips.has(delegation.tripId)
              const allStatePaid = delegation.days.filter((day) => day.state?.amount).every((day) => day.state?.is_paid)
              const stateTotal = delegation.days.reduce((sum, day) => sum + (Number(day.stateAmount.replace(',', '.')) || 0), 0)
              const companyTotal = delegation.days.reduce((sum, day) => sum + (Number(day.companyAmount.replace(',', '.')) || 0), 0)
              const isSaving = savingTripId === delegation.tripId

              return (
                <section key={delegation.tripId} className="surface overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
                    <button type="button" onClick={() => toggleTrip(delegation.tripId)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${allStatePaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {allStatePaid ? <CheckCircle2 size={17} /> : <WalletCards size={17} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{delegation.trip?.client?.name ?? 'Delegacja bez klienta'}</span>
                        <span className="block text-xs text-slate-500">{formatDate(delegation.trip?.date_from ?? delegation.days[0].day)} - {formatDate(delegation.trip?.date_to ?? delegation.days.at(-1)?.day ?? delegation.days[0].day)} · {delegation.trip?.card_number ?? 'bez POP'}</span>
                      </span>
                      {isOpen ? <ChevronUp size={18} className="shrink-0 text-slate-400" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
                    </button>
                    <div className="ml-11 flex items-center gap-4 sm:ml-0">
                      <span className="text-right text-xs text-slate-500"><strong className="block text-sm text-emerald-700">{formatCurrency(stateTotal)}</strong> państwowe</span>
                      <span className="text-right text-xs text-slate-500"><strong className="block text-sm text-blue-700">{formatCurrency(companyTotal)}</strong> firmowe</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600">Szczegóły diet dla tej delegacji. Zatwierdzenie obejmuje wszystkie dni z dietą państwową.</p>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" loading={isSaving} onClick={() => saveDelegation(delegation, false)}><Save size={14} /> Zapisz kwoty</Button>
                          <Button type="button" size="sm" loading={isSaving} disabled={allStatePaid} onClick={() => saveDelegation(delegation, true)}><Check size={14} /> {allStatePaid ? 'Wypłacono' : 'Zatwierdź wypłatę'}</Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {delegation.days.map((day) => (
                          <div key={day.key} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[150px_1fr_1fr] sm:items-center">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{formatDate(day.day)}</p>
                              <p className={`mt-1 text-xs font-medium ${day.state?.is_paid ? 'text-emerald-600' : 'text-amber-600'}`}>{day.state?.is_paid ? 'Wypłacona do ręki' : 'Oczekuje na wypłatę'}</p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-600">Państwowa <input type="number" step="0.01" value={day.stateAmount} onChange={(event) => updateDay(delegation.tripId, day.key, 'stateAmount', event.target.value)} className="ml-auto w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-right" placeholder="0,00" /> PLN</label>
                            <label className="flex items-center gap-2 text-sm text-slate-600">Firmowa <input type="number" step="0.01" value={day.companyAmount} onChange={(event) => updateDay(delegation.tripId, day.key, 'companyAmount', event.target.value)} className="ml-auto w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-right" placeholder="0,00" /> PLN</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
