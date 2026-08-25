import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fuelPurchaseCommandSchema } from '@/lib/schemas/fuel-purchase-command'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = fuelPurchaseCommandSchema.safeParse({ ...(await request.json()), id })
  if (!parsed.success) return NextResponse.json({ error: 'Niepoprawne dane tankowania', details: parsed.error.flatten() }, { status: 400 })

  const { data, error } = await supabase.rpc('save_fuel_purchase', { p_command: parsed.data })

  if (error) return NextResponse.json({ error: 'Tankowanie zostało zmienione przez innego użytkownika lub nie istnieje' }, { status: 409 })
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
  const { error } = await supabase.rpc('delete_fuel_purchase', { p_id: id, p_expected_updated_at: expected_updated_at })
  if (error) return NextResponse.json({ error: 'Tankowanie zostało zmienione przez innego użytkownika lub nie istnieje' }, { status: 409 })
  return NextResponse.json({ success: true })
}
