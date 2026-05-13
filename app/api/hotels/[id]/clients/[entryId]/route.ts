import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, entryId } = await params
  const body = await request.json()

  const { data, error } = await supabase
    .from('hotel_client_distances')
    .update({ distance_km: body.distance_km ?? null, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('hotel_id', id)
    .select('*, client:clients(id, name, code, city)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, entryId } = await params

  const { error } = await supabase
    .from('hotel_client_distances')
    .delete()
    .eq('id', entryId)
    .eq('hotel_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
