import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { TripForm } from '@/components/trips/TripForm'

export const dynamic = 'force-dynamic'

export default async function DodajPrzejazdPage() {
  const supabase = await createClient()

  const [
    { data: vehicles },
    { data: clients },
    { data: lastTrips },
    { data: hotels }
  ] = await Promise.all([
    supabase.from('vehicles').select('*').eq('is_active', true).order('brand'),
    supabase.from('clients').select('*').eq('is_active', true).order('name'),
    supabase
      .from('trips')
      .select('odometer_end, fuel_end, vehicle_id')
      .order('date_from', { ascending: false })
      .limit(1),
    supabase.from('hotel_locations').select('*').eq('is_active', true).order('name')
  ])

  const activeVehicle = (vehicles ?? [])[0] ?? null
  const lastTrip = lastTrips?.[0] ?? null

  // Odometer: from last trip, or from vehicle starting_mileage
  const lastOdometer: number | null =
    lastTrip?.odometer_end ??
    (activeVehicle?.starting_mileage ?? null)

  // Paliwo: from last trip fuel_end, or vehicle starting_fuel
  const lastFuel: number | null =
    lastTrip?.fuel_end ??
    (activeVehicle?.starting_fuel ?? null)

  return (
    <div>
      <Header title="Dodaj przejazd" />
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <TripForm
          vehicles={vehicles ?? []}
          clients={clients ?? []}
          hotels={hotels ?? []}
          lastOdometer={lastOdometer}
          lastFuel={lastFuel}
        />
      </div>
    </div>
  )
}
