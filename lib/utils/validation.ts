import { z } from 'zod'

export const tripSchema = z
  .object({
    date_from: z.string().min(1, 'Data od jest wymagana'),
    date_to: z.string().min(1, 'Data do jest wymagana'),
    trip_type: z.enum(['służbowy', 'prywatny'], { required_error: 'Wybierz typ przejazdu' }),
    vehicle_id: z.string().min(1, 'Wybierz pojazd'),
    driver_id: z.string().optional(),
    client_id: z.string().optional(),
    card_number: z.string().optional(),
    odometer_start: z
      .string()
      .optional()
      .transform((v) => (v ? parseFloat(v) : null))
      .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
    odometer_end: z
      .string()
      .optional()
      .transform((v) => (v ? parseFloat(v) : null))
      .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
    local_km: z
      .string()
      .optional()
      .transform((v) => (v ? parseFloat(v) : null))
      .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
    fuel_start: z
      .string()
      .optional()
      .transform((v) => (v ? parseFloat(v) : null))
      .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
    fuel_purchased: z
      .string()
      .optional()
      .transform((v) => (v ? parseFloat(v) : null))
      .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
    fuel_end: z
      .string()
      .optional()
      .transform((v) => (v ? parseFloat(v) : null))
      .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
    invoice_number: z.string().optional(),
    hotel: z.boolean().default(false),
    hotel_days: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : null))
      .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
    notes: z.string().optional()
  })
  .refine(
    (data) => {
      if (data.date_from && data.date_to) {
        return data.date_to >= data.date_from
      }
      return true
    },
    { message: 'Data końcowa musi być po dacie początkowej', path: ['date_to'] }
  )
  .refine(
    (data) => {
      if (data.odometer_start != null && data.odometer_end != null) {
        return data.odometer_end >= data.odometer_start
      }
      return true
    },
    { message: 'Stan końcowy musi być większy niż początkowy', path: ['odometer_end'] }
  )

export const clientSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, 'Nazwa klienta jest wymagana'),
  city: z.string().optional(),
  distance_km: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : null))
    .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną odległość'),
  is_active: z.boolean().default(true),
  notes: z.string().optional()
})

export const vehicleSchema = z.object({
  brand: z.string().min(1, 'Marka jest wymagana'),
  model: z.string().min(1, 'Model jest wymagany'),
  registration_number: z.string().min(1, 'Numer rejestracyjny jest wymagany'),
  year: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : null))
    .refine((v) => v == null || (!isNaN(v) && v > 1900 && v <= new Date().getFullYear() + 1), 'Wprowadź poprawny rok'),
  fuel_norm: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : null))
    .refine((v) => v == null || (!isNaN(v) && v > 0), 'Wprowadź poprawną normę spalania'),
  tank_capacity: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : null))
    .refine((v) => v == null || (!isNaN(v) && v > 0), 'Wprowadź poprawną pojemność zbiornika'),
  starting_mileage: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : null))
    .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
  starting_fuel: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : null))
    .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną liczbę'),
  is_active: z.boolean().default(true)
})

export const driverSchema = z.object({
  first_name: z.string().min(1, 'Imię jest wymagane'),
  last_name: z.string().min(1, 'Nazwisko jest wymagane'),
  email: z.string().email('Niepoprawny adres email').optional().or(z.literal('')),
  phone: z.string().optional(),
  is_active: z.boolean().default(true)
})

export const fuelSchema = z.object({
  trip_id: z.string().optional(),
  vehicle_id: z.string().min(1, 'Wybierz pojazd'),
  date: z.string().min(1, 'Data jest wymagana'),
  liters: z
    .string()
    .min(1, 'Ilość litrów jest wymagana')
    .transform((v) => parseFloat(v))
    .refine((v) => !isNaN(v) && v > 0, 'Wprowadź poprawną ilość paliwa'),
  amount_gross: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : null))
    .refine((v) => v == null || !isNaN(v), 'Wprowadź poprawną kwotę'),
  invoice_number: z.string().optional(),
  notes: z.string().optional()
})

export type TripSchema = z.infer<typeof tripSchema>
export type ClientSchema = z.infer<typeof clientSchema>
export type VehicleSchema = z.infer<typeof vehicleSchema>
export type DriverSchema = z.infer<typeof driverSchema>
export type FuelSchema = z.infer<typeof fuelSchema>
