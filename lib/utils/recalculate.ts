import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Kaskadowo przelicza odczyty licznika i poziomu paliwa
 * dla wszystkich przejazdów tego samego pojazdu NASTĘPUJĄCYCH
 * chronologicznie po wskazanej dacie.
 *
 * @param supabase       Instancja klienta Supabase (po stronie serwera)
 * @param vehicleId      ID pojazdu, którego przejazdy przeliczamy
 * @param afterDate      Przejazdy z `date_from` ŚCIŚLE WIĘKSZĄ od tej wartości będą przeliczone
 * @param prevOdomEnd    Licznik końcowy (km) poprzedniego (właśnie zapisanego) przejazdu
 * @param prevFuelEnd    Poziom paliwa końcowy (L) poprzedniego (właśnie zapisanego) przejazdu
 */
export async function cascadeRecalculateTrips(
  supabase: SupabaseClient,
  vehicleId: string,
  afterDate: string,
  prevOdomEnd: number | null,
  prevFuelEnd: number | null
): Promise<void> {
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, date_from, local_km, distance_km, fuel_purchased, fuel_used')
    .eq('vehicle_id', vehicleId)
    .gt('date_from', afterDate)
    .order('date_from', { ascending: true })
    .order('created_at', { ascending: true })

  if (error || !trips?.length) return

  let curOdomEnd = prevOdomEnd
  let curFuelEnd = prevFuelEnd

  for (const trip of trips) {
    const localKm = trip.local_km ?? 0
    const distanceKm = trip.distance_km ?? 0
    const fuelPurchased = trip.fuel_purchased ?? 0
    const fuelUsed = trip.fuel_used ?? 0

    // Licznik startowy = koniec poprzedniego + km lokalne bieżącego
    const newOdomStart = curOdomEnd != null ? curOdomEnd + localKm : null
    // Licznik końcowy = startowy + trasa
    const newOdomEnd = newOdomStart != null ? newOdomStart + distanceKm : null
    // Paliwo startowe = koniec poprzedniego
    const newFuelStart = curFuelEnd
    // Paliwo końcowe = start + zakup - zużyte
    const newFuelEnd =
      newFuelStart != null ? newFuelStart + fuelPurchased - fuelUsed : null

    await supabase
      .from('trips')
      .update({
        odometer_start: newOdomStart,
        odometer_end: newOdomEnd,
        fuel_start: newFuelStart,
        fuel_end: newFuelEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    curOdomEnd = newOdomEnd
    curFuelEnd = newFuelEnd
  }
}
