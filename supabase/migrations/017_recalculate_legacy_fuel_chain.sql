-- Przeliczanie stanu paliwa musi przechodzić także przez starsze rekordy legacy.

CREATE OR REPLACE FUNCTION private.recalculate_vehicle_chain(
  p_user_id UUID,
  p_vehicle_id UUID,
  p_from_date DATE,
  p_from_sequence INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  trip_row RECORD;
  previous_fuel NUMERIC;
  purchased NUMERIC;
  used_exact NUMERIC;
  end_exact NUMERIC;
  changed_count INTEGER := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_vehicle_id::TEXT, 0));

  SELECT fuel_end INTO previous_fuel
  FROM public.trips
  WHERE user_id = p_user_id
    AND vehicle_id = p_vehicle_id
    AND (date_from, trip_sequence) < (p_from_date, p_from_sequence)
  ORDER BY date_from DESC, trip_sequence DESC, id DESC
  LIMIT 1;

  FOR trip_row IN
    SELECT *
    FROM public.trips
    WHERE user_id = p_user_id
      AND vehicle_id = p_vehicle_id
      AND (date_from, trip_sequence) >= (p_from_date, p_from_sequence)
    ORDER BY date_from, trip_sequence, id
    FOR UPDATE
  LOOP
    SELECT COALESCE(SUM(liters), 0) INTO purchased
    FROM public.fuel_purchases
    WHERE user_id = p_user_id AND trip_id = trip_row.id;

    IF trip_row.fuel_calculation_mode = 'norm' THEN
      used_exact := (COALESCE(trip_row.distance_km, 0) * COALESCE(trip_row.fuel_norm_used, 0) / 100)
        * (1 + COALESCE(trip_row.fuel_adjustment_percent, 0) / 100.0);
    ELSE
      used_exact := COALESCE(trip_row.fuel_used, 0);
    END IF;

    end_exact := COALESCE(previous_fuel, trip_row.fuel_start) + purchased - used_exact;

    UPDATE public.trips
    SET fuel_start = COALESCE(previous_fuel, trip_row.fuel_start),
        fuel_purchased = purchased,
        fuel_used_exact = CASE WHEN trip_row.fuel_calculation_mode = 'norm' THEN used_exact ELSE fuel_used_exact END,
        fuel_end = ROUND(end_exact, 1),
        updated_at = NOW()
    WHERE id = trip_row.id;

    previous_fuel := ROUND(end_exact, 1);
    changed_count := changed_count + 1;
  END LOOP;

  RETURN changed_count;
END;
$$;

REVOKE ALL ON FUNCTION private.recalculate_vehicle_chain(UUID, UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;