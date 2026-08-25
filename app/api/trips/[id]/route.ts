import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { saveTripCommandSchema } from '@/lib/schemas/trip-command'

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
    .select('*, vehicle:vehicles!trips_vehicle_id_fkey(*), driver:drivers!trips_driver_id_fkey(*), client:clients!trips_client_id_fkey(*), fuel_purchases(*), trip_allowances(*)')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: 'Nie znaleziono przejazdu' }, { status: 404 })
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
  const command = saveTripCommandSchema.safeParse({ ...(await request.json()), trip_id: id })
  if (!command.success) return NextResponse.json({ error: 'Niepoprawne dane przejazdu', details: command.error.flatten() }, { status: 400 })

  const { data, error } = await supabase.rpc('save_trip_with_children', { p_command: command.data })
  if (error) {
    console.error('Trip update RPC failed', error)
    return NextResponse.json({ error: error.message || 'Przejazd został zmieniony przez innego użytkownika lub nie istnieje' }, { status: 409 })
  }
  return NextResponse.json({ data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { expected_updated_at } = await request.json().catch(() => ({}))
  if (typeof expected_updated_at !== 'string') return NextResponse.json({ error: 'Brak wersji rekordu' }, { status: 400 })
  const { error } = await supabase.rpc('delete_trip_and_recalculate', { p_id: id, p_expected_updated_at: expected_updated_at })
  if (error) return NextResponse.json({ error: 'Przejazd został zmieniony przez innego użytkownika lub nie istnieje' }, { status: 409 })
  return NextResponse.json({ success: true })
}
