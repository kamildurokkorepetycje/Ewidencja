-- Usuwanie przejazdu z jawną decyzją o powiązanych tankowaniach.

DROP FUNCTION IF EXISTS public.delete_trip_and_recalculate(UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.delete_trip_and_recalculate(
  p_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_delete_fuel BOOLEAN DEFAULT FALSE
)
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

  IF p_delete_fuel THEN
    DELETE FROM public.fuel_purchases
    WHERE trip_id = p_id AND user_id = current_user_id;
  ELSE
    UPDATE public.fuel_purchases
    SET trip_id = NULL
    WHERE trip_id = p_id AND user_id = current_user_id;
  END IF;

  DELETE FROM public.trips WHERE id = p_id AND user_id = current_user_id;
  PERFORM private.compact_trip_sequence(current_user_id, deleted_row.vehicle_id, deleted_row.date_from);
  PERFORM private.recalculate_vehicle_chain(current_user_id, deleted_row.vehicle_id, deleted_row.date_from, 1);
  RETURN jsonb_build_object('id', deleted_row.id, 'fuel_deleted', p_delete_fuel);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_trip_and_recalculate(UUID, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_trip_and_recalculate(UUID, TIMESTAMPTZ, BOOLEAN) TO authenticated;