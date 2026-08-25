'use client'

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmModal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Alert'
import { DatePicker } from '@/components/ui/DatePicker'
import { formatDate } from '@/lib/utils/formatting'
import { detectTripErrors } from '@/lib/utils/calculations'
import { exportTripsToExcel, exportToCSV } from '@/lib/utils/excel'
import type { Trip, TripFilters } from '@/lib/types'
import { Plus, Filter, Download, Edit2, Trash2, AlertTriangle, CheckCircle, MapPin, Fuel, ArrowUpDown, Eye } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_SIZE = 30
type QuickFilter = 'all' | 'issues' | 'no_invoice' | 'hotel'
type SortKey = 'date' | 'client' | 'km' | 'fuel'

function PrzejazdyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refreshKey = searchParams.get('t')
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<TripFilters>({})
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [exportLoading, setExportLoading] = useState<'excel' | 'csv' | null>(null)

  const buildTripParams = useCallback((targetPage: number, limit: number) => {
    const params = new URLSearchParams()
    params.set('page', String(targetPage))
    params.set('limit', String(limit))
    if (filters.date_from) params.set('date_from', filters.date_from)
    if (filters.date_to) params.set('date_to', filters.date_to)
    if (filters.trip_type) params.set('trip_type', filters.trip_type)
    if (filters.client_id) params.set('client_id', filters.client_id)
    if (filters.has_invoice != null) params.set('has_invoice', String(filters.has_invoice))
    if (filters.has_hotel != null) params.set('has_hotel', String(filters.has_hotel))
    if (filters.card_number) params.set('card_number', filters.card_number)
    if (search) params.set('search', search)

    if (quickFilter === 'issues') params.set('has_errors', 'true')
    if (quickFilter === 'no_invoice') params.set('has_invoice', 'false')
    if (quickFilter === 'hotel') params.set('has_hotel', 'true')

    return params
  }, [filters, search, quickFilter])

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = buildTripParams(page, PAGE_SIZE)

      const res = await fetch(`/api/trips?${params}`)
      const contentType = res.headers.get('content-type') ?? ''
      if (res.redirected || !contentType.includes('application/json')) {
        router.replace('/login')
        return
      }
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Błąd pobierania przejazdów')
      const { data, count } = payload
      setTrips(data ?? [])
      setTotalCount(count ?? 0)
      setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE) || 1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd')
    } finally {
      setLoading(false)
    }
  }, [page, buildTripParams, refreshKey, router])

  useEffect(() => {
    fetchTrips()
  }, [fetchTrips])

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setPage(1)
  }, [filters, search, quickFilter])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleteLoading(true)
    try {
      const trip = trips.find((item) => item.id === deleteId)
      const res = await fetch(`/api/trips/${deleteId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_updated_at: trip?.updated_at })
      })
      if (!res.ok) throw new Error('Nie można usunąć przejazdu')
      toast.success('Przejazd usunięty')
      setDeleteId(null)
      fetchTrips()
    } catch {
      toast.error('Błąd usuwania przejazdu')
    } finally {
      setDeleteLoading(false)
    }
  }

  const sortTrips = useCallback((items: Trip[]) => {
    return [...items].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      if (sort.key === 'date') return a.date_from.localeCompare(b.date_from) * dir
      if (sort.key === 'client') return (a.client?.name ?? '').localeCompare(b.client?.name ?? '', 'pl') * dir
      if (sort.key === 'km') return ((a.distance_km ?? 0) - (b.distance_km ?? 0)) * dir
      return ((a.fuel_used ?? a.fuel_purchased ?? 0) - (b.fuel_used ?? b.fuel_purchased ?? 0)) * dir
    })
  }, [sort])

  const fetchTripsForExport = async () => {
    const params = buildTripParams(1, Math.max(totalCount, PAGE_SIZE, 10000))
    const res = await fetch(`/api/trips?${params}`)
    if (!res.ok) throw new Error('Nie mozna pobrac danych do eksportu')
    const { data } = await res.json()
    return sortTrips(data ?? [])
  }

  const handleExportExcel = async () => {
    setExportLoading('excel')
    try {
      exportTripsToExcel(await fetchTripsForExport(), 'przejazdy.xlsx')
      toast.success('Plik Excel pobrany')
    } catch {
      toast.error('Blad eksportu Excel')
    } finally {
      setExportLoading(null)
    }
  }

  const handleExportCSV = async () => {
    setExportLoading('csv')
    try {
      const rows = (await fetchTripsForExport()).map((t) => ({
        'Data od': t.date_from,
        'Data do': t.date_to,
        'Typ': t.trip_type,
        'Klient': t.client?.name ?? '',
        'Pojazd': t.vehicle?.registration_number ?? '',
        'Km': t.distance_km ?? '',
        'Paliwo': t.fuel_purchased ?? '',
        'Faktura': t.invoice_number ?? '',
        'Hotel': t.hotel ? 'Tak' : 'Nie'
      }))
      exportToCSV(rows, 'przejazdy.csv')
      toast.success('Plik CSV pobrany')
    } catch {
      toast.error('Blad eksportu CSV')
    } finally {
      setExportLoading(null)
    }
  }

  const filtered = useMemo(() => {
    return sortTrips(trips)
  }, [trips, sortTrips])

  const quickFilters: { value: QuickFilter; label: string }[] = [
    { value: 'all', label: 'Wszystkie' },
    { value: 'issues', label: 'Z błędami' },
    { value: 'no_invoice', label: 'Bez faktury' },
    { value: 'hotel', label: 'Z hotelem' }
  ]

  const toggleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc'
    }))
  }

  const SortButton = ({ sortKey, children, align = 'left' }: { sortKey: SortKey; children: React.ReactNode; align?: 'left' | 'right' }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortKey)}
      className={`inline-flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-800 ${align === 'right' ? 'justify-end w-full' : ''}`}
    >
      {children}
      <ArrowUpDown size={12} className={sort.key === sortKey ? 'text-primary-500' : 'text-slate-300'} />
    </button>
  )

  return (
    <div>
      <Header
        title="Przejazdy"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} />
              Filtry
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              loading={exportLoading === 'excel'}
            >
              <Download size={16} />
              Excel
            </Button>
            <Link href="/przejazdy/dodaj">
              <Button size="sm">
                <Plus size={16} />
                Dodaj
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-4 lg:p-6 space-y-4">
        {/* Search */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Szukaj klienta, pojazdu, faktury..."
          className="max-w-sm"
        />

        <div className="flex flex-wrap items-center gap-2">
          {quickFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setQuickFilter(item.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                quickFilter === item.value
                  ? 'border-primary-200 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="surface p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DatePicker
                label="Data od"
                value={filters.date_from}
                onChange={(v) => setFilters((f) => ({ ...f, date_from: v || undefined }))}
              />
              <DatePicker
                label="Data do"
                value={filters.date_to}
                onChange={(v) => setFilters((f) => ({ ...f, date_to: v || undefined }))}
              />
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Typ przejazdu</label>
                <select
                  value={filters.trip_type ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      trip_type: e.target.value as '' | 'służbowy' | 'prywatny'
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
                >
                  <option value="">Wszystkie</option>
                  <option value="służbowy">Służbowy</option>
                  <option value="prywatny">Prywatny</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Nr POP</label>
                <input
                  type="text"
                  placeholder="np. 12345"
                  value={filters.card_number ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, card_number: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Faktura</label>
                <select
                  value={filters.has_invoice == null ? '' : String(filters.has_invoice)}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      has_invoice: e.target.value === '' ? null : e.target.value === 'true'
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
                >
                  <option value="">Wszystkie</option>
                  <option value="true">Z fakturą</option>
                  <option value="false">Bez faktury</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({})
                  setPage(1)
                }}
              >
                Wyczyść filtry
              </Button>
            </div>
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {/* Mobile list */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="surface flex justify-center py-10"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className="surface py-10 text-center text-sm text-slate-400">Brak przejazdów</div>
          ) : (
            filtered.map((trip) => {
              const errors = detectTripErrors(trip, trip.vehicle)
              const hasError = errors.some((e) => e.severity === 'error')
              const hasWarning = errors.some((e) => e.severity === 'warning')
              return (
                <div key={trip.id} className="surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950 truncate">{trip.client?.name ?? 'Bez klienta'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDate(trip.date_from)} · {trip.card_number ?? 'bez POP'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      hasError ? 'bg-red-50 text-red-700'
                      : hasWarning ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {hasError ? 'Błąd' : hasWarning ? 'Uwaga' : 'OK'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Kilometry</p>
                      <p className="font-semibold text-slate-900">{trip.distance_km != null ? `${trip.distance_km} km` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Paliwo</p>
                      <p className="font-semibold text-slate-900">{trip.fuel_used != null ? `${trip.fuel_used} L` : '—'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-1">
                    <Link href={`/przejazdy/${trip.id}`}>
                      <button title="Podgląd" className="p-2 rounded-lg text-slate-500 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                        <Eye size={15} />
                      </button>
                    </Link>
                    <Link href={`/przejazdy/${trip.id}/edytuj`}>
                      <button title="Edytuj" className="p-2 rounded-lg text-slate-500 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                        <Edit2 size={15} />
                      </button>
                    </Link>
                    <button
                      onClick={() => setDeleteId(trip.id)}
                      className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Table */}
        <div className="surface hidden md:block overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr >
                  <th className="w-8 px-4 py-3"></th>
                  <th className="text-left px-4 py-3"><SortButton sortKey="date">Data</SortButton></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">POP</th>
                  <th className="text-left px-4 py-3"><SortButton sortKey="client">Klient</SortButton></th>
                  <th className="text-right px-4 py-3"><SortButton sortKey="km" align="right">Km</SortButton></th>
                  <th className="text-left px-4 py-3"><SortButton sortKey="fuel">Paliwo</SortButton></th>
                  <th className="w-16 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody >
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10">
                      <Spinner />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400">
                      Brak przejazdów
                    </td>
                  </tr>
                ) : (
                  filtered.map((trip) => {
                    const errors = detectTripErrors(trip, trip.vehicle)
                    const hasError = errors.some((e) => e.severity === 'error')
                    const hasWarning = errors.some((e) => e.severity === 'warning')
                    const errorMsg = errors.find(e => e.severity === 'error')?.message
                      ?? errors.find(e => e.severity === 'warning')?.message
                    const days = trip.date_from !== trip.date_to
                      ? Math.round((new Date(trip.date_to).getTime() - new Date(trip.date_from).getTime()) / 86400000) + 1
                      : null
                    return (
                      <tr key={trip.id} className="group">
                        {/* Status */}
                        <td className="px-4 py-3.5">
                          {hasError ? (
                            <span title={errorMsg}>
                              <AlertTriangle size={15} className="text-red-500" />
                            </span>
                          ) : hasWarning ? (
                            <span title={errorMsg}>
                              <AlertTriangle size={15} className="text-amber-400" />
                            </span>
                          ) : (
                            <CheckCircle size={15} className="text-emerald-400" />
                          )}
                        </td>

                        {/* Data */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <p className="font-medium text-slate-950">{formatDate(trip.date_from)}</p>
                          {trip.date_to !== trip.date_from ? (
                            <p className="text-xs text-slate-400">do {formatDate(trip.date_to)} · {days} dni</p>
                          ) : (
                            <p className="text-xs text-slate-400">1 dzień</p>
                          )}
                        </td>

                        {/* POP */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {trip.card_number ? (
                            <span className="text-sm text-slate-700 font-medium">{trip.card_number}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Klient */}
                        <td className="px-4 py-3.5">
                          {trip.client ? (
                            <>
                              <p className="font-medium text-slate-950 max-w-[200px] truncate">{trip.client.name}</p>
                              {trip.client.city && (
                                <p className="text-xs text-slate-400 flex items-center gap-1">
                                  <MapPin size={10} />
                                  {trip.client.city}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Km */}
                        <td className="px-4 py-3.5 text-right">
                          {trip.distance_km != null ? (
                            <span className="font-semibold text-slate-950">{trip.distance_km} km</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Paliwo — stan przed, po, zużycie */}
                        <td className="px-4 py-3.5">
                          {(trip.fuel_start != null || trip.fuel_end != null || trip.fuel_purchased != null) ? (
                            <div className="space-y-0.5 text-xs text-slate-600">
                              {trip.fuel_start != null && (
                                <p><span className="text-slate-400">Przed:</span> {trip.fuel_start} L</p>
                              )}
                              {trip.fuel_end != null && (
                                <p><span className="text-slate-400">Po:</span> {trip.fuel_end} L</p>
                              )}
                              {trip.fuel_purchased != null && (
                                <p className="flex items-center gap-1">
                                  <Fuel size={10} className="text-amber-400" />
                                  <span className="text-slate-400">Zakup:</span> {trip.fuel_purchased} L
                                </p>
                              )}
                              {trip.fuel_used != null && (
                                <p className="font-medium text-slate-700">
                                  <span className="text-slate-400">Zużycie:</span> {trip.fuel_used} L
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Akcje */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <Link href={`/przejazdy/${trip.id}`}>
                              <button title="Podgląd" className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                                <Eye size={14} />
                              </button>
                            </Link>
                            <Link href={`/przejazdy/${trip.id}/edytuj`}>
                              <button title="Edytuj" className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                                <Edit2 size={14} />
                              </button>
                            </Link>
                            <button
                              onClick={() => setDeleteId(trip.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {totalCount} przejazdów · strona {page} z {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleExportCSV} loading={exportLoading === 'csv'}>
                  <Download size={14} />
                  CSV
                </Button>
              </div>
            </div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Usuń przejazd"
        message="Czy na pewno chcesz usunąć ten przejazd? Tej operacji nie można cofnąć."
        confirmLabel="Usuń"
        loading={deleteLoading}
      />
    </div>
  )
}

export default function PrzejazdyPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Spinner size="lg" /></div>}>
      <PrzejazdyContent />
    </Suspense>
  )
}
