-- ============================================================
-- 015_enable_atomic_trip_rpc.sql
-- Włącza atomowy zapis agregatu przejazdu po migracji 013.
-- ============================================================

CREATE OR REPLACE FUNCTION private.assert_trip_relations(
  p_user_id UUID,
  p_vehicle_id UUID,
  p_client_id UUID,
  p_driver_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_vehicle_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = p_vehicle_id AND user_id = p_user_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'INVALID_VEHICLE';
  END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'INVALID_CLIENT';
  END IF;

  IF p_driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.drivers WHERE id = p_driver_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'INVALID_DRIVER';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_trip_with_children(p_command JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  trip_payload JSONB := p_command->'trip';
  purchase_payload JSONB := COALESCE(p_command->'fuel_purchases', '[]'::JSONB);
  fuel_action TEXT := COALESCE(p_command->>'fuel_action', 'preserve_legacy');
  v_trip_id UUID := NULLIF(p_command->>'trip_id', '')::UUID;
  expected_updated_at TIMESTAMPTZ := NULLIF(p_command->>'expected_updated_at', '')::TIMESTAMPTZ;
  v_vehicle_id UUID := NULLIF(trip_payload->>'vehicle_id', '')::UUID;
  v_client_id UUID := NULLIF(trip_payload->>'client_id', '')::UUID;
  v_driver_id UUID := NULLIF(trip_payload->>'driver_id', '')::UUID;
  previous_trip public.trips;
  saved_trip public.trips;
  purchase JSONB;
  purchase_id UUID;
  purchase_expected_updated_at TIMESTAMPTZ;
  norm NUMERIC;
  adjustment SMALLINT;
  total_purchased NUMERIC := 0;
  purchase_ids UUID[] := ARRAY[]::UUID[];
  v_trip_sequence INTEGER;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_command ? 'user_id' OR trip_payload IS NULL OR jsonb_typeof(purchase_payload) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_COMMAND';
  END IF;
  IF fuel_action NOT IN ('preserve_legacy', 'switch_to_norm', 'recalculate_norm') THEN
    RAISE EXCEPTION 'INVALID_FUEL_ACTION';
  END IF;

  PERFORM private.assert_trip_relations(current_user_id, v_vehicle_id, v_client_id, v_driver_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_vehicle_id::TEXT, 0));

  IF v_trip_id IS NOT NULL THEN
    SELECT * INTO previous_trip
    FROM public.trips
    WHERE id = v_trip_id AND user_id = current_user_id
    FOR UPDATE;
    IF previous_trip.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF expected_updated_at IS NULL OR previous_trip.updated_at <> expected_updated_at THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION';
    END IF;
  ELSE
    SELECT COALESCE(MAX(t.trip_sequence), 0) + 1 INTO v_trip_sequence
    FROM public.trips t
    WHERE t.user_id = current_user_id
      AND t.vehicle_id = v_vehicle_id
      AND t.date_from = (trip_payload->>'date_from')::DATE;
  END IF;

  IF v_trip_id IS NULL THEN
    INSERT INTO public.trips (
      user_id, created_by, vehicle_id, client_id, driver_id, date_from, date_to,
      trip_type, card_number, odometer_start, odometer_end, distance_km, local_km,
      trip_legs, fuel_start, fuel_purchased, fuel_end, fuel_used, avg_consumption,
      has_invoice, invoice_number, hotel, hotel_days, notes, trip_sequence,
      fuel_norm_used, fuel_adjustment_percent, fuel_calculation_mode
    ) VALUES (
      current_user_id, current_user_id, v_vehicle_id, v_client_id, v_driver_id,
      (trip_payload->>'date_from')::DATE, (trip_payload->>'date_to')::DATE,
      COALESCE(trip_payload->>'trip_type', 'służbowy'), NULLIF(trip_payload->>'card_number', ''),
      NULLIF(trip_payload->>'odometer_start', '')::NUMERIC, NULLIF(trip_payload->>'odometer_end', '')::NUMERIC,
      NULLIF(trip_payload->>'distance_km', '')::NUMERIC, NULLIF(trip_payload->>'local_km', '')::NUMERIC,
      COALESCE(trip_payload->'trip_legs', '[]'::JSONB), NULLIF(trip_payload->>'fuel_start', '')::NUMERIC,
      0, NULL, NULL, NULL, NULLIF(trip_payload->>'invoice_number', '') IS NOT NULL,
      NULLIF(trip_payload->>'invoice_number', ''), COALESCE((trip_payload->>'hotel')::BOOLEAN, FALSE),
      NULLIF(trip_payload->>'hotel_days', '')::INTEGER, NULLIF(trip_payload->>'notes', ''), v_trip_sequence,
      NULL, 0, CASE WHEN fuel_action = 'preserve_legacy' THEN 'legacy' ELSE 'norm' END
    ) RETURNING * INTO saved_trip;
    v_trip_id := saved_trip.id;
  ELSE
    UPDATE public.trips
    SET vehicle_id = v_vehicle_id,
        client_id = v_client_id,
        driver_id = v_driver_id,
        date_from = (trip_payload->>'date_from')::DATE,
        date_to = (trip_payload->>'date_to')::DATE,
        trip_type = COALESCE(trip_payload->>'trip_type', 'służbowy'),
        card_number = NULLIF(trip_payload->>'card_number', ''),
        odometer_start = NULLIF(trip_payload->>'odometer_start', '')::NUMERIC,
        odometer_end = NULLIF(trip_payload->>'odometer_end', '')::NUMERIC,
        distance_km = NULLIF(trip_payload->>'distance_km', '')::NUMERIC,
        local_km = NULLIF(trip_payload->>'local_km', '')::NUMERIC,
        trip_legs = COALESCE(trip_payload->'trip_legs', '[]'::JSONB),
        fuel_start = NULLIF(trip_payload->>'fuel_start', '')::NUMERIC,
        has_invoice = NULLIF(trip_payload->>'invoice_number', '') IS NOT NULL,
        invoice_number = NULLIF(trip_payload->>'invoice_number', ''),
        hotel = COALESCE((trip_payload->>'hotel')::BOOLEAN, FALSE),
        hotel_days = NULLIF(trip_payload->>'hotel_days', '')::INTEGER,
        notes = NULLIF(trip_payload->>'notes', ''),
        fuel_calculation_mode = CASE
          WHEN fuel_action = 'preserve_legacy' THEN fuel_calculation_mode
          ELSE 'norm'
        END,
        updated_at = NOW()
    WHERE id = v_trip_id
    RETURNING * INTO saved_trip;
  END IF;

  FOR purchase IN SELECT value FROM jsonb_array_elements(purchase_payload)
  LOOP
    purchase_id := NULLIF(purchase->>'id', '')::UUID;
    purchase_expected_updated_at := NULLIF(purchase->>'expected_updated_at', '')::TIMESTAMPTZ;
    IF purchase ? 'user_id' OR NULLIF(purchase->>'vehicle_id', '')::UUID IS DISTINCT FROM v_vehicle_id THEN
      RAISE EXCEPTION 'INVALID_FUEL_PURCHASE';
    END IF;

    IF purchase_id IS NULL THEN
      INSERT INTO public.fuel_purchases (
        user_id, trip_id, vehicle_id, date, liters, amount_gross, invoice_number, notes
      ) VALUES (
        current_user_id, v_trip_id, v_vehicle_id, (purchase->>'date')::DATE,
        NULLIF(purchase->>'liters', '')::NUMERIC, NULLIF(purchase->>'amount_gross', '')::NUMERIC,
        NULLIF(purchase->>'invoice_number', ''), NULLIF(purchase->>'notes', '')
      ) RETURNING id INTO purchase_id;
    ELSE
      UPDATE public.fuel_purchases
      SET date = (purchase->>'date')::DATE,
          liters = NULLIF(purchase->>'liters', '')::NUMERIC,
          amount_gross = NULLIF(purchase->>'amount_gross', '')::NUMERIC,
          invoice_number = NULLIF(purchase->>'invoice_number', ''),
          notes = NULLIF(purchase->>'notes', ''),
          trip_id = v_trip_id,
          vehicle_id = v_vehicle_id
      WHERE id = purchase_id
        AND user_id = current_user_id
        AND trip_id = v_trip_id
        AND updated_at = purchase_expected_updated_at;
      IF NOT FOUND THEN RAISE EXCEPTION 'CONCURRENT_MODIFICATION'; END IF;
    END IF;
    purchase_ids := array_append(purchase_ids, purchase_id);
  END LOOP;

  DELETE FROM public.fuel_purchases
  WHERE user_id = current_user_id
    AND trip_id = v_trip_id
    AND legacy_source_trip_id IS NULL
    AND NOT (id = ANY(purchase_ids));

  SELECT COALESCE(SUM(liters), 0) INTO total_purchased
  FROM public.fuel_purchases
  WHERE user_id = current_user_id AND trip_id = v_trip_id;

  IF fuel_action <> 'preserve_legacy' THEN
    SELECT fuel_norm INTO norm FROM public.vehicles WHERE id = v_vehicle_id;
    adjustment := COALESCE(NULLIF(trip_payload->>'fuel_adjustment_percent', '')::SMALLINT, 0);
    IF adjustment NOT IN (0, 5, 10) THEN RAISE EXCEPTION 'INVALID_FUEL_ADJUSTMENT'; END IF;
    UPDATE public.trips
    SET fuel_norm_used = norm,
        fuel_adjustment_percent = adjustment,
        fuel_calculation_mode = 'norm',
        fuel_purchased = total_purchased,
        updated_at = NOW()
    WHERE id = v_trip_id;
    PERFORM private.recalculate_vehicle_chain(current_user_id, v_vehicle_id, saved_trip.date_from, saved_trip.trip_sequence);
  ELSE
    UPDATE public.trips
    SET fuel_purchased = total_purchased,
        updated_at = NOW()
    WHERE id = v_trip_id;
  END IF;

  SELECT * INTO saved_trip FROM public.trips WHERE id = v_trip_id;
  RETURN jsonb_build_object(
    'trip', to_jsonb(saved_trip),
    'fuel_purchases', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.date, p.id)
      FROM public.fuel_purchases p WHERE p.user_id = current_user_id AND p.trip_id = v_trip_id
    ), '[]'::JSONB)
  );
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
  v_purchase_id UUID := NULLIF(p_command->>'id', '')::UUID;
  expected_updated_at TIMESTAMPTZ := NULLIF(p_command->>'expected_updated_at', '')::TIMESTAMPTZ;
  v_vehicle_id UUID := NULLIF(p_command->>'vehicle_id', '')::UUID;
  v_trip_id UUID := NULLIF(p_command->>'trip_id', '')::UUID;
  result public.fuel_purchases;
  trip_row public.trips;
BEGIN
  IF current_user_id IS NULL OR p_command ? 'user_id' THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = v_vehicle_id AND user_id = current_user_id) THEN
    RAISE EXCEPTION 'INVALID_VEHICLE';
  END IF;
  IF v_trip_id IS NOT NULL THEN
    SELECT * INTO trip_row FROM public.trips WHERE id = v_trip_id AND user_id = current_user_id FOR UPDATE;
    IF trip_row.id IS NULL OR trip_row.vehicle_id <> v_vehicle_id THEN RAISE EXCEPTION 'INVALID_TRIP'; END IF;
  END IF;

  IF v_purchase_id IS NULL THEN
    INSERT INTO public.fuel_purchases (user_id, vehicle_id, trip_id, date, liters, amount_gross, invoice_number, notes)
    VALUES (current_user_id, v_vehicle_id, v_trip_id, (p_command->>'date')::DATE,
      NULLIF(p_command->>'liters', '')::NUMERIC, NULLIF(p_command->>'amount_gross', '')::NUMERIC,
      NULLIF(p_command->>'invoice_number', ''), NULLIF(p_command->>'notes', ''))
    RETURNING * INTO result;
  ELSE
    UPDATE public.fuel_purchases
    SET vehicle_id = v_vehicle_id, trip_id = v_trip_id, date = (p_command->>'date')::DATE,
        liters = NULLIF(p_command->>'liters', '')::NUMERIC,
        amount_gross = NULLIF(p_command->>'amount_gross', '')::NUMERIC,
        invoice_number = NULLIF(p_command->>'invoice_number', ''), notes = NULLIF(p_command->>'notes', '')
    WHERE id = v_purchase_id AND user_id = current_user_id AND updated_at = expected_updated_at
    RETURNING * INTO result;
    IF result.id IS NULL THEN RAISE EXCEPTION 'CONCURRENT_MODIFICATION'; END IF;
  END IF;

  IF v_trip_id IS NOT NULL AND trip_row.fuel_calculation_mode = 'norm' THEN
    PERFORM private.recalculate_vehicle_chain(current_user_id, v_vehicle_id, trip_row.date_from, trip_row.trip_sequence);
  END IF;
  RETURN to_jsonb(result);
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
  SELECT * INTO deleted_row
  FROM public.trips
  WHERE id = p_id AND user_id = current_user_id
  FOR UPDATE;
  IF deleted_row.id IS NULL OR deleted_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION';
  END IF;

  UPDATE public.fuel_purchases
  SET trip_id = NULL
  WHERE trip_id = p_id AND user_id = current_user_id;
  DELETE FROM public.trips WHERE id = p_id AND user_id = current_user_id;
  PERFORM private.compact_trip_sequence(current_user_id, deleted_row.vehicle_id, deleted_row.date_from);
  PERFORM private.recalculate_vehicle_chain(current_user_id, deleted_row.vehicle_id, deleted_row.date_from, 1);
  RETURN jsonb_build_object('id', deleted_row.id);
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
  trip_row public.trips;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  DELETE FROM public.fuel_purchases
  WHERE id = p_id
    AND user_id = current_user_id
    AND updated_at = p_expected_updated_at
  RETURNING * INTO deleted_row;
  IF deleted_row.id IS NULL THEN RAISE EXCEPTION 'CONCURRENT_MODIFICATION'; END IF;

  IF deleted_row.trip_id IS NOT NULL THEN
    SELECT * INTO trip_row
    FROM public.trips
    WHERE id = deleted_row.trip_id AND user_id = current_user_id;
    IF trip_row.id IS NOT NULL AND trip_row.fuel_calculation_mode = 'norm' THEN
      PERFORM private.recalculate_vehicle_chain(
        current_user_id, trip_row.vehicle_id, trip_row.date_from, trip_row.trip_sequence
      );
    END IF;
  END IF;

  RETURN to_jsonb(deleted_row);
END;
$$;

REVOKE ALL ON FUNCTION private.assert_trip_relations(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_trip_with_children(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_fuel_purchase(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_trip_and_recalculate(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_fuel_purchase(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_trip_with_children(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_fuel_purchase(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip_and_recalculate(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_fuel_purchase(UUID, TIMESTAMPTZ) TO authenticated;
