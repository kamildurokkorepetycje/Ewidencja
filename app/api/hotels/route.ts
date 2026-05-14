import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')

  if (clientId) {
    const { data: distances, error } = await supabase
      .from('hotel_client_distances')
      .select('hotel_id, distance_km, hotel:hotel_locations(id, name, city, notes, is_active, created_at, user_id)')
      .eq('client_id', clientId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type HotelRow = { id: string; name: string; city: string | null; notes: string | null; is_active: boolean; created_at: string; distance_km: number | null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = ((distances ?? []) as any[])
      .filter((d) => d.hotel?.user_id === user.id)
      .map((d): HotelRow => ({ ...d.hotel, distance_km: d.distance_km }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ data })
  }

  const { data, error } = await supabase
    .from('hotel_locations')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('hotel_locations')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
