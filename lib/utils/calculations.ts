import { Trip, TripError, Vehicle } from '@/lib/types'

/**
 * Oblicza liczbę kilometrów trasy (bez km lokalnych) na podstawie stanów licznika
 */
export function calculateDistance(
  odometerStart: number | null,
  odometerEnd: number | null,
  localKm: number | null = null
): number | null {
  if (odometerStart == null || odometerEnd == null) return null
  const total = Math.max(0, odometerEnd - odometerStart)
  return Math.max(0, total - (localKm ?? 0))
}

/**
 * Oblicza zużycie paliwa
 */
export function calculateFuelUsed(
  fuelStart: number | null,
  fuelPurchased: number | null,
  fuelEnd: number | null
): number | null {
  if (fuelStart == null || fuelEnd == null) return null
  const purchased = fuelPurchased ?? 0
  return Math.max(0, fuelStart + purchased - fuelEnd)
}

/**
 * Oblicza średnie spalanie [l/100km]
 */
export function calculateAvgConsumption(
  fuelUsed: number | null,
  distanceKm: number | null
): number | null {
  if (!fuelUsed || !distanceKm || distanceKm === 0) return null
  return (fuelUsed / distanceKm) * 100
}

/**
 * Szacuje zużycie paliwa na podstawie normy pojazdu
 */
export function estimateFuelUsed(
  distanceKm: number | null,
  fuelNorm: number | null
): number | null {
  if (!distanceKm || !fuelNorm) return null
  return (distanceKm * fuelNorm) / 100
}

/**
 * Wykrywa błędy i ostrzeżenia w przejeździe
 */
export function detectTripErrors(
  trip: Partial<Trip>,
  vehicle?: Vehicle | null
): TripError[] {
  const errors: TripError[] = []

  // Brak daty
  if (!trip.date_from) {
    errors.push({ field: 'date_from', message: 'Brak daty początkowej', severity: 'error' })
  }
  if (!trip.date_to) {
    errors.push({ field: 'date_to', message: 'Brak daty końcowej', severity: 'error' })
  }

  // Data końcowa przed datą początkową
  if (trip.date_from && trip.date_to && trip.date_to < trip.date_from) {
    errors.push({
      field: 'date_to',
      message: 'Data końcowa jest wcześniejsza niż początkowa',
      severity: 'error'
    })
  }

  // Brak pojazdu
  if (!trip.vehicle_id) {
    errors.push({ field: 'vehicle_id', message: 'Brak pojazdu', severity: 'error' })
  }

  // Brak klienta przy przejeździe służbowym
  if (trip.trip_type === 'służbowy' && !trip.client_id) {
    errors.push({
      field: 'client_id',
      message: 'Brak klienta przy przejeździe służbowym',
      severity: 'error'
    })
  }

  // Klient wpisany przy przejeździe prywatnym
  if (trip.trip_type === 'prywatny' && trip.client_id) {
    errors.push({
      field: 'client_id',
      message: 'Klient wpisany przy przejeździe prywatnym',
      severity: 'warning'
    })
  }

  // Stan licznika
  if (trip.odometer_start != null && trip.odometer_end != null) {
    if (trip.odometer_end < trip.odometer_start) {
      errors.push({
        field: 'odometer_end',
        message: 'Stan końcowy licznika jest mniejszy niż początkowy',
        severity: 'error'
      })
    }

    // Liczba km niezgodna — local_km jest już wliczone w odometerStart, nie odejmujemy go
    if (trip.distance_km != null) {
      const calculated = trip.odometer_end - trip.odometer_start
      if (Math.abs(calculated - trip.distance_km) > 2) {
        errors.push({
          field: 'distance_km',
          message: `Liczba km (${trip.distance_km}) niezgodna ze stanem licznika (${calculated})`,
          severity: 'warning'
        })
      }
    }
  }

  // Zakup paliwa bez numeru faktury
  if (trip.fuel_purchased && trip.fuel_purchased > 0 && !trip.invoice_number) {
    errors.push({
      field: 'invoice_number',
      message: 'Zakup paliwa bez numeru faktury',
      severity: 'warning'
    })
  }

  // Paliwo końcowe poniżej zera
  if (trip.fuel_end != null && trip.fuel_end < 0) {
    errors.push({
      field: 'fuel_end',
      message: 'Paliwo końcowe poniżej zera',
      severity: 'error'
    })
  }

  // Zakup paliwa przekracza pojemność zbiornika
  if (vehicle?.tank_capacity && trip.fuel_purchased) {
    if (trip.fuel_purchased > vehicle.tank_capacity) {
      errors.push({
        field: 'fuel_purchased',
        message: `Zakup paliwa (${trip.fuel_purchased}L) przekracza pojemność zbiornika (${vehicle.tank_capacity}L)`,
        severity: 'error'
      })
    }
  }

  // Duża różnica między standardową trasą a wpisanym przebiegiem
  if (trip.client && (trip.client as { distance_km?: number }).distance_km && trip.distance_km) {
    const standard = (trip.client as { distance_km: number }).distance_km
    // Oblicz liczbę dni wyjazdu
    let days = 1
    if (trip.date_from && trip.date_to) {
      const d1 = new Date(trip.date_from).getTime()
      const d2 = new Date(trip.date_to).getTime()
      days = Math.max(1, Math.round((d2 - d1) / 86400000) + 1)
    } else if (trip.trip_legs && Array.isArray(trip.trip_legs)) {
      const uniqueDays = new Set(trip.trip_legs.map((l: { day: string }) => l.day))
      days = Math.max(1, uniqueDays.size)
    }
    // Spodziewane km = standardowa odległość × 2 (tam+z powrotem) × liczba dni
    const expected = standard * 2 * days
    const diff = Math.abs(trip.distance_km - expected)
    if (diff > expected * 0.4) {
      errors.push({
        field: 'distance_km',
        message: `Duża różnica między oczekiwanym przebiegiem (${expected} km, ${days} dni × ${standard * 2} km) a wpisanym (${trip.distance_km} km)`,
        severity: 'warning'
      })
    }
  }

  return errors
}

/**
 * Oblicza statystyki miesięczne dla listy przejazdów
 */
export function calculateMonthlyStats(trips: Trip[]) {
  const totalKm = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0)
  const businessKm = trips
    .filter((t) => t.trip_type === 'służbowy')
    .reduce((sum, t) => sum + (t.distance_km ?? 0), 0)
  const privateKm = trips
    .filter((t) => t.trip_type === 'prywatny')
    .reduce((sum, t) => sum + (t.distance_km ?? 0), 0)
  const localKm = trips.reduce((sum, t) => sum + (t.local_km ?? 0), 0)
  const totalFuel = trips.reduce((sum, t) => sum + (t.fuel_purchased ?? 0), 0)
  const totalFuelUsed = trips.reduce((sum, t) => sum + (t.fuel_used ?? 0), 0)
  const avgConsumption =
    totalKm > 0 ? calculateAvgConsumption(totalFuelUsed, totalKm) : null

  return { totalKm, businessKm, privateKm, localKm, totalFuel, totalFuelUsed, avgConsumption }
}
