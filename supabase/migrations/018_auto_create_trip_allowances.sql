-- Automatyczne tworzenie diet dla każdego dnia przejazdu.

CREATE OR REPLACE FUNCTION public.sync_trip_allowances()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.trip_allowances
  WHERE trip_id = NEW.id
    AND user_id = NEW.user_id
    AND day NOT BETWEEN NEW.date_from AND NEW.date_to;

  INSERT INTO public.trip_allowances (trip_id, user_id, day, allowance_type)
  SELECT NEW.id, NEW.user_id, days.day, allowance_types.allowance_type
  FROM pg_catalog.generate_series(NEW.date_from, NEW.date_to, INTERVAL '1 day') AS days(day)
  CROSS JOIN (VALUES ('state'::TEXT), ('company'::TEXT)) AS allowance_types(allowance_type)
  ON CONFLICT (trip_id, day, allowance_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trip_allowances ON public.trips;
CREATE TRIGGER trg_sync_trip_allowances
  AFTER INSERT OR UPDATE OF date_from, date_to ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_trip_allowances();

INSERT INTO public.trip_allowances (trip_id, user_id, day, allowance_type)
SELECT t.id, t.user_id, days.day, allowance_types.allowance_type
FROM public.trips t
CROSS JOIN LATERAL pg_catalog.generate_series(t.date_from, t.date_to, INTERVAL '1 day') AS days(day)
CROSS JOIN (VALUES ('state'::TEXT), ('company'::TEXT)) AS allowance_types(allowance_type)
ON CONFLICT (trip_id, day, allowance_type) DO NOTHING;

REVOKE ALL ON FUNCTION public.sync_trip_allowances() FROM PUBLIC, anon, authenticated;
