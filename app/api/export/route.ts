import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = searchParams.get('type') ?? 'trips'
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  if (type === 'trips') {
    let query = supabase
      .from('trips')
      .select('*, vehicle:vehicles(brand,model,registration_number), driver:drivers(first_name,last_name), client:clients(code,name,city)')
      .order('date_from', { ascending: false })

    if (dateFrom) query = query.gte('date_from', dateFrom)
    if (dateTo) query = query.lte('date_from', dateTo)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  }

  if (type === 'clients') {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
}
