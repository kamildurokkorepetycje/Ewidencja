import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectTripErrors } from '@/lib/utils/calculations'
import { saveTripCommandSchema } from '@/lib/schemas/trip-command'
import type { Trip } from '@/lib/types'

const MAX_PAGE_SIZE = 100
const privateApiHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: privateApiHeaders })

  const params = new URL(request.url).searchParams
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(params.get('limit') ?? '50') || 50))
  let query = supabase
    .from('trips')
    .select('*, vehicle:vehicles(*), driver:drivers(*), client:clients(*)', { count: 'exact' })
    .order('date_from', { ascending: false })
    .order('trip_sequence', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  const dateFrom = params.get('date_from')
  const dateTo = params.get('date_to')
  const tripType = params.get('trip_type')
  const clientId = params.get('client_id')
  const vehicleId = params.get('vehicle_id')
  if (dateFrom) query = query.gte('date_from', dateFrom)
  if (dateTo) query = query.lte('date_from', dateTo)
  if (tripType) query = query.eq('trip_type', tripType)
  if (clientId) query = query.eq('client_id', clientId)
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)

  const { data, error, count } = await query
  if (error) {
    console.error('Trips list query failed', error)
    return NextResponse.json({ error: 'Nie można pobrać przejazdów' }, { status: 500, headers: privateApiHeaders })
  }

  const search = params.get('search')?.trim().toLowerCase()
  const filtered = ((data ?? []) as Trip[]).filter((trip) => {
    if (!search) return true
    return [trip.invoice_number, trip.card_number, trip.client?.name, trip.client?.code, trip.vehicle?.registration_number]
      .some((value) => value?.toLowerCase().includes(search))
  })
  const hasErrors = params.get('has_errors') === 'true'
  const result = hasErrors ? filtered.filter((trip) => detectTripErrors(trip, trip.vehicle).length > 0) : filtered

  return NextResponse.json({ data: result, count: count ?? result.length }, { headers: privateApiHeaders })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const command = saveTripCommandSchema.safeParse(await request.json())
  if (!command.success) return NextResponse.json({ error: 'Niepoprawne dane przejazdu', details: command.error.flatten() }, { status: 400 })

  const { data, error } = await supabase.rpc('save_trip_with_children', { p_command: command.data })
  if (error) return NextResponse.json({ error: 'Nie można zapisać przejazdu' }, { status: 400 })
  return NextResponse.json({ data }, { status: 201 })
}
