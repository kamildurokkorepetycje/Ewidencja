import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateDistance, calculateFuelUsed, detectTripErrors } from '@/lib/utils/calculations'
import { cascadeRecalculateTrips } from '@/lib/utils/recalculate'
import { z } from 'zod'
import type { Trip } from '@/lib/types'

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

function matchesSearch(trip: Trip, search: string) {
  const q = search.trim().toLowerCase()
  if (!q) return true
  const values = [
    trip.invoice_number,
    trip.card_number,
    trip.client?.name,
    trip.client?.code,
    trip.client?.city,
    trip.vehicle?.registration_number,
    trip.vehicle?.brand,
    trip.vehicle?.model,
  ]
  return values.some((value) => value?.toLowerCase().includes(q))
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
  allowances: z.infer<typeof allowanceInputSchema>[] = []
) {
  const byDay = new Map(allowances.map((item) => [item.day, item]))
  const rows = dateRange(dateFrom, dateTo).flatMap((day) => {
    const input = byDay.get(day)
    const date = new Date(day)
    const settlementYear = date.getFullYear()
    const settlementMonth = date.getMonth() + 1

    return [
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
  })

  if (rows.length === 0) return

  const { error } = await supabase
    .from('trip_allowances')
    .upsert(rows, { onConflict: 'trip_id,day,allowance_type' })

  if (error) throw new Error(error.message)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabase
    .from('trips')
    .select('*, vehicle:vehicles(*), driver:drivers(*), client:clients(*)', { count: 'exact' })
    .order('date_from', { ascending: false })

  // Filters
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const tripType = searchParams.get('trip_type')
  const clientId = searchParams.get('client_id')
  const vehicleId = searchParams.get('vehicle_id')
  const driverId = searchParams.get('driver_id')
  const hasInvoice = searchParams.get('has_invoice')
  const hasHotel = searchParams.get('has_hotel')
  const hasErrors = searchParams.get('has_errors')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  if (dateFrom) query = query.gte('date_from', dateFrom)
  if (dateTo) query = query.lte('date_from', dateTo)
  if (tripType) query = query.eq('trip_type', tripType)
  if (clientId) query = query.eq('client_id', clientId)
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  if (driverId) query = query.eq('driver_id', driverId)
  if (hasInvoice === 'true') query = query.not('invoice_number', 'is', null)
  if (hasInvoice === 'false') query = query.is('invoice_number', null)
  if (hasHotel === 'true') query = query.eq('hotel', true)
  if (hasHotel === 'false') query = query.eq('hotel', false)

  const cardNumber = searchParams.get('card_number')
  if (cardNumber) query = query.ilike('card_number', `%${cardNumber}%`)

  const search = searchParams.get('search')

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let filtered = ((data ?? []) as Trip[])

  if (search) {
    filtered = filtered.filter((trip) => matchesSearch(trip, search))
  }

  if (hasErrors === 'true') {
    filtered = filtered.filter((trip) => detectTripErrors(trip, trip.vehicle).length > 0)
  }

  const count = filtered.length
  const offset = (Math.max(1, page) - 1) * Math.max(1, limit)
  const paged = filtered.slice(offset, offset + Math.max(1, limit))

  return NextResponse.json({ data: paged, count })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = tripPayloadSchema.safeParse(await request.json())
  if (!parsed.success) return validationError(parsed.error)
  const body = parsed.data

  // Auto-resolve driver_id from user's driver record
  let driverId: string | null = body.driver_id ?? null
  const { data: existingDriver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingDriver) {
    driverId = existingDriver.id
  } else {
    // Auto-create driver record from user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    const fullName = profile?.full_name ?? ''
    const parts = fullName.trim().split(/\s+/)
    const firstName = parts[0] ?? ''
    const lastName = parts.slice(1).join(' ') || firstName
    const { data: newDriver } = await supabase
      .from('drivers')
      .insert({ first_name: firstName, last_name: lastName, user_id: user.id, is_active: true })
      .select('id')
      .single()
    driverId = newDriver?.id ?? null
  }

  // Auto-calculate distance and fuel used
  const distanceKm = calculateDistance(body.odometer_start, body.odometer_end)
  const fuelUsed = calculateFuelUsed(body.fuel_start, body.fuel_purchased ?? null, body.fuel_end)

  const tripData: Record<string, unknown> = {
    ...body,
    distance_km: distanceKm ?? body.distance_km,
    fuel_used: fuelUsed ?? body.fuel_used,
    user_id: user.id,
    driver_id: driverId,
    created_by: user.id,
    updated_at: new Date().toISOString()
  }

  // Remove joined fields
  delete tripData.vehicle
  delete tripData.driver
  delete tripData.client
  delete tripData.allowances

  const { data, error } = await supabase.from('trips').insert(tripData).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await syncTripAllowances(supabase, data.id, user.id, data.date_from, data.date_to, body.allowances)
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Nie mozna zapisac diet'
    }, { status: 500 })
  }

  // Auto-sync fuel_purchase when invoice_number is set
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

  return NextResponse.json({ data }, { status: 201 })
}
