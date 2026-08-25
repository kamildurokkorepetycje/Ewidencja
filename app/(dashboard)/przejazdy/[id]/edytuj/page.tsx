import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { TripForm } from '@/components/trips/TripForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EdytujPrzejazdPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: trip }, { data: vehicles }, { data: clients }, { data: hotels }] = await Promise.all([
    supabase.from('trips').select('*').eq('id', id).single(),
    supabase.from('vehicles').select('*').eq('is_active', true).order('brand'),
    supabase.from('clients').select('*').eq('is_active', true).order('name'),
    supabase.from('hotel_locations').select('*').eq('is_active', true).order('name')
  ])

  if (!trip) return notFound()

  const [{ data: vehicle }, { data: driver }, { data: client }, { data: fuelPurchases }] = await Promise.all([
    supabase.from('vehicles').select('*').eq('id', trip.vehicle_id).maybeSingle(),
    supabase.from('drivers').select('*').eq('id', trip.driver_id).maybeSingle(),
    supabase.from('clients').select('*').eq('id', trip.client_id).maybeSingle(),
    supabase.from('fuel_purchases').select('*').eq('trip_id', id).order('date')
  ])
  const tripWithRelations = { ...trip, vehicle: vehicle ?? undefined, driver: driver ?? undefined, client: client ?? undefined, fuel_purchases: fuelPurchases ?? [] }

  return (
    <div>
      <Header title="Edytuj przejazd" />
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <TripForm
          initialData={tripWithRelations}
          vehicles={vehicles ?? []}
          clients={clients ?? []}
          hotels={hotels ?? []}
        />
      </div>
    </div>
  )
}
