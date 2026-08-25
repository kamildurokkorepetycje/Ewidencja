import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const nullableNumber = z.preprocess(
  (value) => {
    if (value === '' || value == null) return null
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(',', '.'))
      return Number.isNaN(parsed) ? value : parsed
    }
    return value
  },
  z.number().nullable()
)

const allowanceUpdateSchema = z.object({
  id: z.string().min(1),
  amount: nullableNumber,
  is_paid: z.boolean().optional(),
  paid_at: z.string().nullable().optional(),
  payment_note: z.string().nullable().optional(),
  is_settled: z.boolean().optional(),
  settled_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
})

const payloadSchema = z.object({
  allowances: z.array(allowanceUpdateSchema)
})

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')
  const month = searchParams.get('month')

  let query = supabase
    .from('trip_allowances')
    .select('*, trip:trips!trip_allowances_trip_id_fkey(id,date_from,date_to,card_number,client:clients!trips_client_id_fkey(name,city))')
    .order('day', { ascending: false })
    .order('allowance_type', { ascending: false })

  if (year && month) {
    const m = String(month).padStart(2, '0')
    const lastDay = new Date(Number(year), Number(month), 0).getDate()
    query = query.gte('day', `${year}-${m}-01`).lte('day', `${year}-${m}-${lastDay}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = payloadSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Niepoprawne dane diet', details: parsed.error.flatten() }, { status: 400 })
  }

  const updates = await Promise.all(
    parsed.data.allowances.map(async (item) => {
      const update: Record<string, unknown> = {
        amount: item.amount,
        updated_at: new Date().toISOString()
      }

      if (item.is_paid !== undefined) {
        update.is_paid = item.is_paid
        update.paid_at = item.is_paid ? (item.paid_at ?? new Date().toISOString()) : null
        update.paid_by = item.is_paid ? user.id : null
        update.payment_note = item.payment_note ?? null
      }

      if (item.is_settled !== undefined) {
        update.is_settled = item.is_settled
        update.settled_at = item.is_settled ? (item.settled_at ?? new Date().toISOString()) : null
      }

      if (item.notes !== undefined) update.notes = item.notes

      const { data, error } = await supabase
        .from('trip_allowances')
        .update(update)
        .eq('id', item.id)
        .select()
        .single()

      if (error) throw error
      return data
    })
  )

  return NextResponse.json({ data: updates })
}
