import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateDistance, calculateFuelUsed } from '@/lib/utils/calculations'
import { cascadeRecalculateTrips } from '@/lib/utils/recalculate'
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

const nullableInteger = z.preprocess(
  (value) => {
    if (value === '' || value == null) return null
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      return Number.isNaN(parsed) ? value : parsed
    }
    return value
  },
  z.number().int().nullable()
)

const nullableString = z.preprocess(
  (value) => (value === '' || value == null ? null : value),
  z.string().nullable()
)

const allowanceInputSchema = z.object({
  day: z.string().min(1),
  state_amount: nullableNumber.optional(),
  state_paid: z.boolean().optional().default(false),
  state_paid_at: nullableString.optional(),
  state_payment_note: nullableString.optional(),
  company_amount: nullableNumber.optional(),
  company_settled: z.boolean().optional().default(false),
  company_settled_at: nullableString.optional(),
  notes: nullableString.optional()
})

const tripPayloadSchema = z.object({
  date_from: z.string().min(1),
  date_to: z.string().min(1),
  trip_type: z.string().min(1).default('służbowy'),
  vehicle_id: nullableString,
  driver_id: nullableString.optional(),
  client_id: nullableString.optional(),
  card_number: nullableString.optional(),
  odometer_start: nullableNumber,
  odometer_end: nullableNumber,
  distance_km: nullableNumber.optional(),
  local_km: nullableNumber.optional(),
  trip_legs: z.array(z.object({
    day: z.string(),
    from: z.string().optional().default(''),
    to: z.string().optional().default(''),
    km: nullableNumber.transform((value) => value ?? 0),
    hotel_id: nullableString.optional()
  })).nullable().optional(),
  fuel_start: nullableNumber,
  fuel_purchased: nullableNumber.optional(),
  fuel_end: nullableNumber,
  fuel_used: nullableNumber.optional(),
  avg_consumption: nullableNumber.optional(),
  invoice_number: nullableString.optional(),
  hotel: z.boolean().default(false),
  hotel_days: nullableInteger.optional(),
  notes: nullableString.optional(),
  allowances: z.array(allowanceInputSchema).optional()
}).refine((data) => data.date_to >= data.date_from, {
  message: 'Data koncowa musi byc po dacie poczatkowej',
  path: ['date_to']
}).refine((data) => {
  if (data.odometer_start != null && data.odometer_end != null) {
    return data.odometer_end >= data.odometer_start
  }
  return true
}, {
  message: 'Stan koncowy musi byc wiekszy niz poczatkowy',
  path: ['odometer_end']
})

function validationError(error: z.ZodError) {
  return NextResponse.json({
    error: 'Niepoprawne dane przejazdu',
    details: error.flatten()
  }, { status: 400 })
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(from)
  const end = new Date(to)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return dates
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

async function syncTripAllowances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  userId: string,
  dateFrom: string,
  dateTo: string,
  allowances?: z.infer<typeof allowanceInputSchema>[]
) {
  const validDays = dateRange(dateFrom, dateTo)
  const valid = new Set(validDays)

  const { data: existing, error: existingError } = await supabase
    .from('trip_allowances')
    .select('id, day, allowance_type')
    .eq('trip_id', tripId)

  if (existingError) throw new Error(existingError.message)

  const staleIds = (existing ?? [])
    .filter((item) => !valid.has(item.day))
    .map((item) => item.id)

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('trip_allowances')
      .delete()
      .in('id', staleIds)

    if (deleteError) throw new Error(deleteError.message)
  }

  const existingKeys = new Set(
    (existing ?? [])
      .filter((item) => valid.has(item.day))
      .map((item) => `${item.day}:${item.allowance_type}`)
  )

  const byDay = new Map((allowances ?? []).map((item) => [item.day, item]))
  const rows = validDays.flatMap((day) => {
    const input = byDay.get(day)
    const date = new Date(day)
    const settlementYear = date.getFullYear()
    const settlementMonth = date.getMonth() + 1

    const dayRows = [
      {
        trip_id: tripId,
        user_id: userId,
        day,
        allowance_type: 'state',
        amount: input?.state_amount ?? null,
        is_paid: input?.state_paid ?? false,
        is_settled: false,
        settlement_year: null,
        settlement_month: null,
        settled_at: null,
        paid_at: input?.state_paid ? (input.state_paid_at ?? new Date().toISOString()) : null,
        paid_by: input?.state_paid ? userId : null,
        payment_note: input?.state_payment_note ?? null,
        notes: input?.notes ?? null,
        updated_at: new Date().toISOString()
      },
      {
        trip_id: tripId,
        user_id: userId,
        day,
        allowance_type: 'company',
        amount: input?.company_amount ?? null,
        is_paid: false,
        paid_at: null,
        paid_by: null,
        payment_note: null,
        settlement_year: settlementYear,
        settlement_month: settlementMonth,
        is_settled: input?.company_settled ?? false,
        settled_at: input?.company_settled ? (input.company_settled_at ?? new Date().toISOString()) : null,
        notes: input?.notes ?? null,
        updated_at: new Date().toISOString()
      }
    ]

    if (allowances === undefined) {
      return dayRows.filter((row) => !existingKeys.has(`${row.day}:${row.allowance_type}`))
    }

    return dayRows
  })

  if (rows.length === 0) return

  const { error: upsertError } = await supabase
    .from('trip_allowances')
    .upsert(rows, { onConflict: 'trip_id,day,allowance_type' })

  if (upsertError) throw new Error(upsertError.message)
}

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
  const parsed = tripPayloadSchema.safeParse(await request.json())
  if (!parsed.success) return validationError(parsed.error)
  const body = parsed.data

  // Auto-calculate
  const distanceKm = calculateDistance(body.odometer_start, body.odometer_end)
  const fuelUsed = calculateFuelUsed(body.fuel_start, body.fuel_purchased ?? null, body.fuel_end)

  const tripData: Record<string, unknown> = {
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
  delete tripData.allowances

  const { data, error } = await supabase
    .from('trips')
    .update(tripData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await syncTripAllowances(supabase, data.id, user.id, data.date_from, data.date_to, body.allowances)
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Nie mozna zapisac diet'
    }, { status: 500 })
  }

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
