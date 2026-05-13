import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateDistance, calculateFuelUsed } from '@/lib/utils/calculations'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabase
    .from('trips')
    .select('*, vehicle:vehicles(*), driver:drivers(*), client:clients(*)', { count: 'exact' })
    .order('date_from', { ascending: false })

  // Filters
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const tripType = searchParams.get('trip_type')
  const clientId = searchParams.get('client_id')
  const vehicleId = searchParams.get('vehicle_id')
  const driverId = searchParams.get('driver_id')
  const hasInvoice = searchParams.get('has_invoice')
  const hasHotel = searchParams.get('has_hotel')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  if (dateFrom) query = query.gte('date_from', dateFrom)
  if (dateTo) query = query.lte('date_from', dateTo)
  if (tripType) query = query.eq('trip_type', tripType)
  if (clientId) query = query.eq('client_id', clientId)
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  if (driverId) query = query.eq('driver_id', driverId)
  if (hasInvoice === 'true') query = query.not('invoice_number', 'is', null)
  if (hasInvoice === 'false') query = query.is('invoice_number', null)
  if (hasHotel === 'true') query = query.eq('hotel', true)
  if (hasHotel === 'false') query = query.eq('hotel', false)

  const cardNumber = searchParams.get('card_number')
  if (cardNumber) query = query.ilike('card_number', `%${cardNumber}%`)

  const search = searchParams.get('search')
  if (search) {
    query = query.or(`invoice_number.ilike.%${search}%,card_number.ilike.%${search}%`)
  }

  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count: count ?? 0 })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Auto-resolve driver_id from user's driver record
  let driverId: string | null = body.driver_id ?? null
  const { data: existingDriver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingDriver) {
    driverId = existingDriver.id
  } else {
    // Auto-create driver record from user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    const fullName = profile?.full_name ?? ''
    const parts = fullName.trim().split(/\s+/)
    const firstName = parts[0] ?? ''
    const lastName = parts.slice(1).join(' ') || firstName
    const { data: newDriver } = await supabase
      .from('drivers')
      .insert({ first_name: firstName, last_name: lastName, user_id: user.id, is_active: true })
      .select('id')
      .single()
    driverId = newDriver?.id ?? null
  }

  // Auto-calculate distance and fuel used
  const distanceKm = calculateDistance(body.odometer_start, body.odometer_end)
  const fuelUsed = calculateFuelUsed(body.fuel_start, body.fuel_purchased, body.fuel_end)

  const tripData = {
    ...body,
    distance_km: distanceKm ?? body.distance_km,
    fuel_used: fuelUsed ?? body.fuel_used,
    user_id: user.id,
    driver_id: driverId,
    created_by: user.id,
    updated_at: new Date().toISOString()
  }

  // Remove joined fields
  delete tripData.vehicle
  delete tripData.driver
  delete tripData.client

  const { data, error } = await supabase.from('trips').insert(tripData).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-sync fuel_purchase when invoice_number is set
  if (data.invoice_number) {
    await supabase.from('fuel_purchases').insert({
      trip_id: data.id,
      vehicle_id: data.vehicle_id ?? null,
      date: data.date_from,
      liters: data.fuel_purchased ?? null,
      invoice_number: data.invoice_number,
      user_id: user.id,
    })
  }

  return NextResponse.json({ data }, { status: 201 })
}
