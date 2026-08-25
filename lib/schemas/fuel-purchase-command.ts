import { z } from 'zod'

const uuidSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const nullableDecimal = z.preprocess((value) => {
  if (value === '' || value == null) return null
  if (typeof value === 'string') return value.replace(',', '.')
  return String(value)
}, z.string().regex(/^\d+(\.\d+)?$/).nullable())
const nullableString = z.preprocess((value) => value === '' || value == null ? null : value, z.string().nullable())

export const fuelPurchaseCommandSchema = z.object({
  id: uuidSchema.optional(),
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
  vehicle_id: uuidSchema,
  trip_id: uuidSchema.nullable(),
  date: dateSchema,
  liters: nullableDecimal.refine((value) => value == null || Number(value) > 0, 'Ilość litrów musi być dodatnia'),
  amount_gross: nullableDecimal,
  invoice_number: nullableString,
  notes: nullableString
}).strict()

export type FuelPurchaseCommand = z.infer<typeof fuelPurchaseCommandSchema>
