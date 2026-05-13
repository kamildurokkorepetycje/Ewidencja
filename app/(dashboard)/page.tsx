import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Alert } from '@/components/ui/Alert'
import { formatDate, formatLiters, getMonthName } from '@/lib/utils/formatting'
import { calculateMonthlyStats, detectTripErrors } from '@/lib/utils/calculations'
import type { Trip } from '@/lib/types'
import Link from 'next/link'
import {
  Fuel,
  FileText,
  AlertTriangle,
  MapPin,
  Droplets,
  Plus,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Gauge,
  Briefcase,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return <span className="text-xs text-slate-400">bez zmian</span>
  const up = pct > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
      up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
    }`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{pct}%
    </span>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

  // Previous month
  const prevD = new Date(year, month - 2, 1)
  const pY = prevD.getFullYear()
  const pM = prevD.getMonth() + 1
  const prevStart = `${pY}-${String(pM).padStart(2, '0')}-01`
  const prevEnd = new Date(pY, pM, 0).toISOString().split('T')[0]

  const [
    { data: trips = [] },
    { data: prevTrips = [] },
    { data: lastTripFuel },
  ] = await Promise.all([
    supabase
      .from('trips')
      .select('*, vehicle:vehicles(*), driver:drivers(*), client:clients(*)')
      .gte('date_from', monthStart)
      .lte('date_from', monthEnd)
      .order('date_from', { ascending: false }),
    supabase
      .from('trips')
      .select('distance_km, fuel_purchased, trip_type, local_km, invoice_number')
      .gte('date_from', prevStart)
      .lte('date_from', prevEnd),
    supabase
      .from('trips')
      .select('fuel_end, odometer_end, vehicle:vehicles(tank_capacity)')
      .not('fuel_end', 'is', null)
      .order('date_from', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const stats = calculateMonthlyStats((trips ?? []) as Trip[])
  const prevStats = calculateMonthlyStats((prevTrips ?? []) as Trip[])

  const currentFuel = (lastTripFuel?.fuel_end as number | null | undefined) ?? null
  const currentOdometer = (lastTripFuel?.odometer_end as number | null | undefined) ?? null
  const tankCapacity = (lastTripFuel?.vehicle as unknown as { tank_capacity: number | null } | null)?.tank_capacity ?? null
  const fuelPct = currentFuel != null && tankCapacity
    ? Math.min(100, Math.round((currentFuel / tankCapacity) * 100))
    : null

  const tripsWithErrors = (trips ?? []).filter((t) =>
    detectTripErrors(t, t.vehicle).some((e) => e.severity === 'error')
  )
  const tripsWithWarnings = (trips ?? []).filter((t) =>
    detectTripErrors(t, t.vehicle).some((e) => e.severity === 'warning')
  )

  const invoiceCount = (trips ?? []).filter((t) => t.invoice_number).length
  const prevInvoiceCount = (prevTrips ?? []).filter((t: { invoice_number: string | null }) => t.invoice_number).length
  const recentTrips = (trips ?? []).slice(0, 5)

  return (
    <div>
      <Header title={`Dashboard – ${getMonthName(month)} ${year}`} />
      <div className="p-4 lg:p-6 space-y-5">

        {/* ── Vehicle status hero ── */}
        <div className="surface p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">

            {/* Stan licznika */}
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                <Gauge size={21} />
              </div>
              <div>
                <p className="muted-label mb-1">Stan licznika</p>
                <div className="flex items-end gap-1.5">
                  <span className="text-3xl font-bold tracking-tight tabular-nums leading-none text-slate-950">
                    {currentOdometer != null
                      ? Math.round(currentOdometer).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
                      : '—'}
                  </span>
                  {currentOdometer != null && <span className="text-slate-400 text-lg mb-0.5">km</span>}
                </div>
                <p className="text-slate-500 text-sm mt-1">Ostatni odczyt</p>
              </div>
            </div>

            {/* Stan paliwa */}
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Droplets size={22} className={
                  fuelPct != null && fuelPct < 15 ? 'text-red-500'
                  : fuelPct != null && fuelPct < 30 ? 'text-amber-500'
                  : 'text-emerald-600'
                } />
              </div>
              <div className="flex-1 min-w-0">
                <p className="muted-label mb-1">Stan paliwa</p>
                <div className="flex items-end gap-1.5">
                  <span className={`text-3xl font-bold tracking-tight tabular-nums leading-none ${
                    fuelPct != null && fuelPct < 15 ? 'text-red-600'
                    : fuelPct != null && fuelPct < 30 ? 'text-amber-600'
                    : 'text-slate-950'
                  }`}>
                    {currentFuel != null ? currentFuel.toFixed(1) : '—'}
                  </span>
                  {currentFuel != null && <span className="text-slate-400 text-lg mb-0.5">L</span>}
                </div>
                {fuelPct != null ? (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          fuelPct < 15 ? 'bg-red-500' : fuelPct < 30 ? 'bg-amber-400' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${fuelPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums shrink-0">{fuelPct}%</span>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm mt-1">Brak danych</p>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Quick actions ── */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/przejazdy/dodaj"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Plus size={15} />
            Nowy przejazd
          </Link>
          <Link
            href="/paliwo"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Fuel size={15} className="text-amber-500" />
            Paliwo i faktury
          </Link>
          <Link
            href="/raporty"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <FileText size={15} className="text-blue-500" />
            Raporty
          </Link>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {/* Km służbowe */}
          <div className="surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Km służbowe</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Briefcase size={15} className="text-blue-500" />
              </div>
            </div>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-slate-950 tabular-nums leading-none">
                {stats.businessKm.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}
              </span>
              <span className="text-slate-400 text-sm mb-0.5">km</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <TrendBadge current={stats.businessKm} previous={prevStats.businessKm} />
              <span className="text-xs text-slate-400">vs poprz. miesiąc</span>
            </div>
          </div>

          {/* Km lokalnie */}
          <div className="surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Km lokalnie</span>
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <MapPin size={15} className="text-violet-500" />
              </div>
            </div>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-slate-950 tabular-nums leading-none">
                {stats.localKm.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}
              </span>
              <span className="text-slate-400 text-sm mb-0.5">km</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <TrendBadge current={stats.localKm} previous={prevStats.localKm} />
              <span className="text-xs text-slate-400">vs poprz. miesiąc</span>
            </div>
          </div>

          {/* Zakup paliwa */}
          <div className="surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Zakup paliwa</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Fuel size={15} className="text-amber-500" />
              </div>
            </div>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-slate-950 tabular-nums leading-none">
                {stats.totalFuel.toFixed(1)}
              </span>
              <span className="text-slate-400 text-sm mb-0.5">L</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <TrendBadge current={stats.totalFuel} previous={prevStats.totalFuel} />
              <span className="text-xs text-slate-400">vs poprz. miesiąc</span>
            </div>
          </div>

          {/* Faktury */}
          <div className="surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Faktury</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <FileText size={15} className="text-blue-500" />
              </div>
            </div>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-slate-950 tabular-nums leading-none">
                {invoiceCount}
              </span>
              <span className="text-slate-400 text-sm mb-0.5">szt.</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <TrendBadge current={invoiceCount} previous={prevInvoiceCount} />
              <span className="text-xs text-slate-400">vs poprz. miesiąc</span>
            </div>
          </div>

        </div>


        {recentTrips.length > 0 && (
          <div className="surface overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <MapPin size={15} className="text-primary-500" />
              <h3 className="text-sm font-semibold text-slate-950">Ostatnie przejazdy</h3>
              <Link href="/przejazdy" className="ml-auto text-xs font-semibold text-primary-600 hover:text-primary-700">
                Wszystkie
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {recentTrips.map((trip) => (
                <Link
                  key={trip.id}
                  href={`/przejazdy/${trip.id}/edytuj`}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-950 truncate">{trip.client?.name ?? 'Bez klienta'}</p>
                    <p className="text-xs text-slate-400">{formatDate(trip.date_from)} · {trip.card_number ?? 'bez POP'}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-950 tabular-nums">{trip.distance_km ?? 0} km</span>
                  <span className="text-xs text-slate-400 tabular-nums">{formatLiters(trip.fuel_used)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Alerts ── */}
        {tripsWithErrors.length > 0 && (
          <Alert variant="error" title="Błędy w danych">
            <p>
              {tripsWithErrors.length} przejazdów wymaga poprawy.{' '}
              <Link href="/przejazdy" className="underline font-medium">Przejdź →</Link>
            </p>
          </Alert>
        )}
        {tripsWithWarnings.length > 0 && (
          <Alert variant="warning" title="Ostrzeżenia">
            <p>
              {tripsWithWarnings.length} przejazdów ma potencjalne błędy.{' '}
              <Link href="/przejazdy" className="underline font-medium">Sprawdź →</Link>
            </p>
          </Alert>
        )}

        {/* ── Error detail list ── */}
        {(tripsWithErrors.length > 0 || tripsWithWarnings.length > 0) && (
          <div className="surface overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-950">Przejazdy do poprawy</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {[...tripsWithErrors, ...tripsWithWarnings].slice(0, 8).map((trip) => {
                const errs = detectTripErrors(trip, trip.vehicle)
                const err = errs.find(e => e.severity === 'error') ?? errs.find(e => e.severity === 'warning')
                if (!err) return null
                return (
                  <Link
                    key={trip.id}
                    href={`/przejazdy/${trip.id}/edytuj`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      err.severity === 'error' ? 'bg-red-500' : 'bg-amber-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{err.message}</p>
                      <p className="text-xs text-slate-400">{trip.date_from} · {trip.client?.name ?? '—'}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
                  </Link>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
