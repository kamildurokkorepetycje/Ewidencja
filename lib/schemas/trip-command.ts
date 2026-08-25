import { z } from 'zod'

const uuidSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Niepoprawny znacznik czasu')
const nullableString = z.preprocess((value) => value === '' || value == null ? null : value, z.string().nullable())
const nullableNumber = z.preprocess((value) => {
  if (value === '' || value == null) return null
  if (typeof value === 'string') return value.replace(',', '.')
  return String(value)
}, z.string().regex(/^-?\d+(\.\d+)?$/).nullable())

const tripLegSchema = z.object({
  day: dateSchema,
  from: z.string().max(200),
  to: z.string().max(200),
  km: nullableNumber,
  hotel_id: uuidSchema.nullable().optional()
}).strict()

const fuelPurchaseSchema = z.object({
  id: uuidSchema.optional(),
  expected_updated_at: timestampSchema.optional(),
  vehicle_id: uuidSchema,
  date: dateSchema,
  liters: nullableNumber,
  amount_gross: nullableNumber,
  invoice_number: nullableString,
  notes: nullableString
}).strict()

export const saveTripCommandSchema = z.object({
  trip_id: uuidSchema.optional(),
  expected_updated_at: timestampSchema.optional(),
  fuel_action: z.enum(['preserve_legacy', 'switch_to_norm', 'recalculate_norm']),
  trip: z.object({
    date_from: dateSchema,
    date_to: dateSchema,
    trip_type: z.enum(['służbowy', 'prywatny']),
    vehicle_id: uuidSchema,
    client_id: uuidSchema.nullable(),
    driver_id: uuidSchema.nullable(),
    card_number: nullableString,
    odometer_start: nullableNumber,
    odometer_end: nullableNumber,
    distance_km: nullableNumber,
    local_km: nullableNumber,
    trip_legs: z.array(tripLegSchema),
    fuel_start: nullableNumber,
    fuel_adjustment_percent: z.union([z.literal(0), z.literal(5), z.literal(10)]),
    invoice_number: nullableString,
    hotel: z.boolean(),
    hotel_days: z.preprocess((value) => value === '' || value == null ? null : Number(value), z.number().int().nullable()),
    notes: nullableString
  }).strict().refine((trip) => trip.date_to >= trip.date_from, {
    message: 'Data końcowa musi być po dacie początkowej', path: ['date_to']
  }),
  fuel_purchases: z.array(fuelPurchaseSchema).max(50)
}).strict()

export type SaveTripCommand = z.infer<typeof saveTripCommandSchema>
