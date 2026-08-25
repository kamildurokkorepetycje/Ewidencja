-- ============================================================
-- 013_trip_atomic_operations.sql
-- Deterministyczna kolejność, dokładne przeliczenie i RPC.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS trip_sequence INTEGER;

WITH numbered AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY user_id, vehicle_id, date_from
      ORDER BY created_at, id
    )::INTEGER AS sequence
  FROM public.trips
)
UPDATE public.trips t
SET trip_sequence = numbered.sequence
FROM numbered
WHERE numbered.id = t.id
  AND t.trip_sequence IS NULL;

ALTER TABLE public.trips ALTER COLUMN trip_sequence SET NOT NULL;
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_owner_vehicle_date_sequence_key;
ALTER TABLE public.trips ADD CONSTRAINT trips_owner_vehicle_date_sequence_key
  UNIQUE (user_id, vehicle_id, date_from, trip_sequence)
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION private.compact_trip_sequence(
  p_user_id UUID,
  p_vehicle_id UUID,
  p_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  WITH numbered AS (
    SELECT id,
      row_number() OVER (ORDER BY trip_sequence, id)::INTEGER AS sequence
    FROM public.trips
    WHERE user_id = p_user_id
      AND vehicle_id = p_vehicle_id
      AND date_from = p_date
  )
  UPDATE public.trips t
  SET trip_sequence = numbered.sequence
  FROM numbered
  WHERE t.id = numbered.id;
END;
$$;

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
    IF trip_row.fuel_calculation_mode <> 'norm' THEN
      previous_fuel := trip_row.fuel_end;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(liters), 0) INTO purchased
    FROM public.fuel_purchases
    WHERE user_id = p_user_id AND trip_id = trip_row.id;

    used_exact := (COALESCE(trip_row.distance_km, 0) * COALESCE(trip_row.fuel_norm_used, 0) / 100)
      * (1 + COALESCE(trip_row.fuel_adjustment_percent, 0) / 100.0);
    end_exact := COALESCE(previous_fuel, trip_row.fuel_start) + purchased - used_exact;

    UPDATE public.trips
    SET fuel_start = COALESCE(previous_fuel, trip_row.fuel_start),
        fuel_used_exact = used_exact,
        fuel_end = ROUND(end_exact, 1),
        updated_at = NOW()
    WHERE id = trip_row.id;

    previous_fuel := ROUND(end_exact, 1);
    changed_count := changed_count + 1;
  END LOOP;

  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_vehicle_trips(
  p_vehicle_id UUID,
  p_from_date DATE,
  p_from_sequence INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  changed_count INTEGER;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id AND user_id = current_user_id) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  changed_count := private.recalculate_vehicle_chain(
    current_user_id, p_vehicle_id, p_from_date, p_from_sequence
  );
  RETURN jsonb_build_object('recalculated', changed_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_fuel_purchase(p_command JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  purchase_id UUID := NULLIF(p_command->>'id', '')::UUID;
  expected_updated_at TIMESTAMPTZ := NULLIF(p_command->>'expected_updated_at', '')::TIMESTAMPTZ;
  result public.fuel_purchases;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_command ? 'user_id' THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = (p_command->>'vehicle_id')::UUID AND user_id = current_user_id
  ) THEN RAISE EXCEPTION 'INVALID_VEHICLE'; END IF;

  IF purchase_id IS NULL THEN
    INSERT INTO public.fuel_purchases (user_id, vehicle_id, trip_id, date, liters, amount_gross, invoice_number, notes)
    VALUES (
      current_user_id, (p_command->>'vehicle_id')::UUID,
      NULLIF(p_command->>'trip_id', '')::UUID, (p_command->>'date')::DATE,
      NULLIF(p_command->>'liters', '')::NUMERIC, NULLIF(p_command->>'amount_gross', '')::NUMERIC,
      NULLIF(p_command->>'invoice_number', ''), NULLIF(p_command->>'notes', '')
    ) RETURNING * INTO result;
  ELSE
    UPDATE public.fuel_purchases
    SET vehicle_id = (p_command->>'vehicle_id')::UUID,
        trip_id = NULLIF(p_command->>'trip_id', '')::UUID,
        date = (p_command->>'date')::DATE,
        liters = NULLIF(p_command->>'liters', '')::NUMERIC,
        amount_gross = NULLIF(p_command->>'amount_gross', '')::NUMERIC,
        invoice_number = NULLIF(p_command->>'invoice_number', ''),
        notes = NULLIF(p_command->>'notes', '')
    WHERE id = purchase_id AND user_id = current_user_id AND updated_at = expected_updated_at
    RETURNING * INTO result;
    IF result.id IS NULL THEN RAISE EXCEPTION 'CONCURRENT_MODIFICATION'; END IF;
  END IF;
  RETURN to_jsonb(result);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_fuel_purchase(p_id UUID, p_expected_updated_at TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  deleted_row public.fuel_purchases;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  DELETE FROM public.fuel_purchases
  WHERE id = p_id AND user_id = current_user_id AND updated_at = p_expected_updated_at
  RETURNING * INTO deleted_row;
  IF deleted_row.id IS NULL THEN RAISE EXCEPTION 'CONCURRENT_MODIFICATION'; END IF;
  RETURN to_jsonb(deleted_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_trip_and_recalculate(p_id UUID, p_expected_updated_at TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  deleted_row public.trips;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  DELETE FROM public.trips
  WHERE id = p_id AND user_id = current_user_id AND updated_at = p_expected_updated_at
  RETURNING * INTO deleted_row;
  IF deleted_row.id IS NULL THEN RAISE EXCEPTION 'CONCURRENT_MODIFICATION'; END IF;
  UPDATE public.fuel_purchases SET trip_id = NULL
  WHERE trip_id = p_id AND user_id = current_user_id;
  PERFORM private.compact_trip_sequence(current_user_id, deleted_row.vehicle_id, deleted_row.date_from);
  PERFORM private.recalculate_vehicle_chain(current_user_id, deleted_row.vehicle_id, deleted_row.date_from, 1);
  RETURN jsonb_build_object('id', deleted_row.id);
END;
$$;

-- save_trip_with_children pozostaje wyraźnym gate'em do przełączenia API.
-- Obecny frontend używa bezpośrednich, legacy route handlers i nie może uruchamiać 014.
CREATE OR REPLACE FUNCTION public.save_trip_with_children(p_command JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  RAISE EXCEPTION 'TRIP_RPC_NOT_ENABLED: deploy API command mapping before enabling atomic trip writes';
END;
$$;

REVOKE ALL ON FUNCTION private.compact_trip_sequence(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_vehicle_chain(UUID, UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_vehicle_trips(UUID, DATE, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_fuel_purchase(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_fuel_purchase(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_trip_and_recalculate(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_trip_with_children(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_vehicle_trips(UUID, DATE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_fuel_purchase(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_fuel_purchase(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip_and_recalculate(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_trip_with_children(JSONB) TO authenticated;
