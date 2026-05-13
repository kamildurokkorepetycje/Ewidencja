import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectTripErrors } from '@/lib/utils/calculations'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null

  let query = supabase
    .from('trips')
    .select('*, vehicle:vehicles(*), driver:drivers(*), client:clients(*)')
    .gte('date_from', `${year}-01-01`)
    .lte('date_from', `${year}-12-31`)
    .order('date_from')

  if (month) {
    const monthStr = String(month).padStart(2, '0')
    const daysInMonth = new Date(year, month, 0).getDate()
    query = query
      .gte('date_from', `${year}-${monthStr}-01`)
      .lte('date_from', `${year}-${monthStr}-${daysInMonth}`)
  }

  const { data: trips, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Build report
  const totalKm = (trips ?? []).reduce((s, t) => s + (t.distance_km ?? 0), 0)
  const businessKm = (trips ?? [])
    .filter((t) => t.trip_type === 'służbowy')
    .reduce((s, t) => s + (t.distance_km ?? 0), 0)
  const privateKm = (trips ?? [])
    .filter((t) => t.trip_type === 'prywatny')
    .reduce((s, t) => s + (t.distance_km ?? 0), 0)
  const localKm = (trips ?? []).reduce((s, t) => s + (t.local_km ?? 0), 0)
  const totalFuel = (trips ?? []).reduce((s, t) => s + (t.fuel_purchased ?? 0), 0)
  const totalFuelUsed = (trips ?? []).reduce((s, t) => s + (t.fuel_used ?? 0), 0)
  const avgConsumption = totalKm > 0 ? (totalFuelUsed / totalKm) * 100 : null
  const invoiceCount = (trips ?? []).filter((t) => t.invoice_number).length
  const hotelCount = (trips ?? []).filter((t) => t.hotel).length
  const nightCount = (trips ?? []).reduce((s, t) => s + (t.hotel ? (t.hotel_days ?? 1) : 0), 0)
  const errors = (trips ?? []).flatMap((trip) => {
    const vehicle = Array.isArray(trip.vehicle) ? trip.vehicle[0] : trip.vehicle
    return detectTripErrors(trip, vehicle ?? null)
  })

  // Monthly breakdown (for annual report)
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const monthTrips = (trips ?? []).filter((t) => {
      const tm = parseInt(t.date_from.split('-')[1])
      return tm === m
    })
    return {
      month: m,
      km: monthTrips.reduce((s, t) => s + (t.distance_km ?? 0), 0),
      fuel: monthTrips.reduce((s, t) => s + (t.fuel_purchased ?? 0), 0),
      trips: monthTrips.length
    }
  })

  return NextResponse.json({
    data: {
      year,
      month,
      trip_count: (trips ?? []).length,
      trips,
      total_km: totalKm,
      business_km: businessKm,
      private_km: privateKm,
      local_km: localKm,
      total_fuel: totalFuel,
      total_fuel_used: totalFuelUsed,
      avg_consumption: avgConsumption,
      invoice_count: invoiceCount,
      hotel_count: hotelCount,
      night_count: nightCount,
      monthly_data: monthlyData,
      errors
    }
  })
}
