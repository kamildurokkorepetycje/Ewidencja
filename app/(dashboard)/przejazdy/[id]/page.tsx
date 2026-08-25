import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { PrintButton } from '@/components/trips/PrintButton'
import { formatCurrency, formatDate, formatKm, formatLiters, formatNumber, formatDateRange } from '@/lib/utils/formatting'
import { ArrowLeft, Edit2, MapPin, Car, Fuel, FileText, Hotel } from 'lucide-react'
import type { Trip } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SzczegolyPrzejazduPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: tripRow, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !tripRow) return notFound()
  const [{ data: vehicle }, { data: driver }, { data: client }, { data: fuelPurchases }] = await Promise.all([
    supabase.from('vehicles').select('*').eq('id', tripRow.vehicle_id).maybeSingle(),
    supabase.from('drivers').select('*').eq('id', tripRow.driver_id).maybeSingle(),
    supabase.from('clients').select('*').eq('id', tripRow.client_id).maybeSingle(),
    supabase.from('fuel_purchases').select('*').eq('trip_id', id).order('date')
  ])
  const trip = { ...tripRow, vehicle: vehicle ?? undefined, driver: driver ?? undefined, client: client ?? undefined, fuel_purchases: fuelPurchases ?? [] } as Trip
  const legs = trip.trip_legs ?? []
  const purchases = trip.fuel_purchases ?? []

  return (
    <div className="print-area">
      <Header
        title="Podgląd przejazdu"
        actions={
          <div className="flex gap-2 no-print">
            <Link href="/przejazdy"><Button variant="outline" size="sm"><ArrowLeft size={15} /> Wróć</Button></Link>
            <PrintButton />
            <Link href={`/przejazdy/${trip.id}/edytuj`}><Button size="sm"><Edit2 size={15} /> Edytuj</Button></Link>
          </div>
        }
      />
      <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
        <div className="surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="muted-label">Przejazd</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">{trip.client?.name ?? 'Bez klienta'}</h1>
              <p className="mt-1 text-sm text-slate-500">{formatDateRange(trip.date_from, trip.date_to)} · {trip.trip_type}</p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <p>{trip.vehicle?.registration_number ?? 'Brak pojazdu'}</p>
              {trip.card_number && <p>POP: {trip.card_number}</p>}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 border-t border-slate-100 pt-5">
            <Summary label="Dystans" value={formatKm(trip.distance_km)} icon={<MapPin size={15} />} />
            <Summary label="Licznik" value={trip.odometer_start != null && trip.odometer_end != null ? `${formatNumber(trip.odometer_start)} - ${formatNumber(trip.odometer_end)}` : '-'} icon={<Car size={15} />} />
            <Summary label="Zużycie" value={formatLiters(trip.fuel_used)} icon={<Fuel size={15} />} />
            <Summary label="Zakup paliwa" value={formatLiters(trip.fuel_purchased)} icon={<Fuel size={15} />} />
          </div>
        </div>

        <section className="surface overflow-hidden">
          <SectionTitle icon={<MapPin size={16} />} title="Trasa" />
          <div className="divide-y divide-slate-100">
            {legs.length === 0 ? <p className="p-5 text-sm text-slate-400">Brak zapisanych etapów.</p> : legs.map((leg, index) => (
              <div key={`${leg.day}-${index}`} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 p-4 text-sm">
                <span>{leg.from || '-'}</span><span className="text-slate-300">-&gt;</span><span>{leg.to || '-'}</span><strong className="text-right">{formatKm(Number(leg.km) || 0)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="surface overflow-hidden">
          <SectionTitle icon={<Fuel size={16} />} title="Paliwo i faktury" />
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 text-sm">
            <Detail label="Początkowe" value={formatLiters(trip.fuel_start)} />
            <Detail label="Końcowe" value={formatLiters(trip.fuel_end)} />
            <Detail label="Norma" value={trip.fuel_norm_used != null ? `${trip.fuel_norm_used} L/100 km` : '-'} />
            <Detail label="Naddatek" value={trip.fuel_adjustment_percent != null ? `P${trip.fuel_adjustment_percent}` : '-'} />
          </div>
          {purchases.length > 0 && <div className="border-t border-slate-100 divide-y divide-slate-100">{purchases.map((purchase) => <div key={purchase.id} className="flex flex-wrap justify-between gap-3 px-5 py-3 text-sm"><span>{formatDate(purchase.date)}{purchase.invoice_number ? ` · ${purchase.invoice_number}` : ''}</span><span className="font-medium">{formatLiters(purchase.liters)}{purchase.amount_gross != null ? ` · ${formatCurrency(purchase.amount_gross)}` : ''}</span></div>)}</div>}
        </section>

        {(trip.hotel || trip.notes || trip.invoice_number) && <section className="surface p-5 space-y-3 text-sm">
          {trip.hotel && <p className="flex items-center gap-2"><Hotel size={15} className="text-purple-500" /> Hotel: {trip.hotel_days ?? 0} dni</p>}
          {trip.invoice_number && <p className="flex items-center gap-2"><FileText size={15} className="text-slate-400" /> Faktura: {trip.invoice_number}</p>}
          {trip.notes && <p className="whitespace-pre-wrap text-slate-600">{trip.notes}</p>}
        </section>}
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-800">{icon}{title}</div>
}

function Summary({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div><p className="flex items-center gap-1 text-xs text-slate-400">{icon}{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-semibold text-slate-800">{value}</p></div>
}