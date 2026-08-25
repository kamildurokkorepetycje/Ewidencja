import { describe, expect, it } from 'vitest'
import { calculateMonthlyStats } from '@/lib/utils/calculations'
import type { Trip } from '@/lib/types'

describe('calculateMonthlyStats', () => {
  it('sums all linked fuel invoices instead of the legacy trip total', () => {
    const trips = [{
      id: 'trip-1',
      date_from: '2026-08-01',
      date_to: '2026-08-01',
      trip_type: 'służbowy',
      vehicle_id: 'vehicle-1',
      driver_id: null,
      client_id: null,
      card_number: null,
      odometer_start: 100,
      odometer_end: 200,
      distance_km: 100,
      local_km: null,
      trip_legs: null,
      fuel_start: 30,
      fuel_purchased: 5,
      fuel_end: 20,
      fuel_used: 25,
      invoice_number: null,
      hotel: false,
      hotel_days: null,
      notes: null,
      created_by: 'user-1',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      fuel_purchases: [
        { liters: 36.42 },
        { liters: 12.08 }
      ]
    }] as unknown as Trip[]

    expect(calculateMonthlyStats(trips).totalFuel).toBe(48.5)
  })
})
