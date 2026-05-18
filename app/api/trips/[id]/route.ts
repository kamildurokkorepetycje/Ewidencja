import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateDistance, calculateFuelUsed } from '@/lib/utils/calculations'
import { cascadeRecalculateTrips } from '@/lib/utils/recalculate'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('trips')
    .select('*, vehicle:vehicles(*), driver:drivers(*), client:clients(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  // Auto-calculate
  const distanceKm = calculateDistance(body.odometer_start, body.odometer_end)
  const fuelUsed = calculateFuelUsed(body.fuel_start, body.fuel_purchased, body.fuel_end)

  const tripData = {
    ...body,
    distance_km: distanceKm ?? body.distance_km,
    fuel_used: fuelUsed ?? body.fuel_used,
    updated_at: new Date().toISOString()
  }

  delete tripData.vehicle
  delete tripData.driver
  delete tripData.client
  delete tripData.id
  delete tripData.created_by
  delete tripData.created_at
  delete tripData.driver_id
  delete tripData.user_id

  const { data, error } = await supabase
    .from('trips')
    .update(tripData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync fuel_purchase: delete old entry for this trip, then re-insert if invoice_number is set
  await supabase.from('fuel_purchases').delete().eq('trip_id', id)
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

  // Kaskadowe przeliczenie kolejnych przejazdów tego samego pojazdu
  if (data.vehicle_id) {
    await cascadeRecalculateTrips(
      supabase,
      data.vehicle_id,
      data.date_from,
      data.odometer_end,
      data.fuel_end
    )
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('trips').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
