import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fuelPurchaseCommandSchema } from '@/lib/schemas/fuel-purchase-command'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabase
    .from('fuel_purchases')
    .select('*, vehicle:vehicles!fuel_purchases_vehicle_id_fkey(brand,model,registration_number), trip:trips!fuel_purchases_trip_id_fkey(date_from,date_to,card_number)')
    .order('date', { ascending: false })

  const vehicleId = searchParams.get('vehicle_id')
  const tripId = searchParams.get('trip_id')
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  if (tripId) query = query.eq('trip_id', tripId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = fuelPurchaseCommandSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Niepoprawne dane tankowania', details: parsed.error.flatten() }, { status: 400 })

  const { data, error } = await supabase.rpc('save_fuel_purchase', { p_command: parsed.data })
  if (error) return NextResponse.json({ error: 'Nie można zapisać tankowania' }, { status: 400 })
  return NextResponse.json({ data }, { status: 201 })
}
