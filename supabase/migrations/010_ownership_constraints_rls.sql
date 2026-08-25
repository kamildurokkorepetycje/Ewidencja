-- ============================================================
-- 010_ownership_constraints_rls.sql
-- Wymusza ownership i RLS po pomyślnym backfillu 009.
-- ============================================================

DO $$
DECLARE
  table_name TEXT;
  has_null_owner BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'trips', 'clients', 'vehicles', 'drivers', 'fuel_purchases',
    'hotel_locations', 'hotel_client_distances', 'hotels',
    'import_logs', 'audit_logs', 'trip_allowances'
  ] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE user_id IS NULL)', table_name)
      INTO has_null_owner;
    IF has_null_owner THEN
      RAISE EXCEPTION 'Cannot enforce ownership: public.% contains a null user_id', table_name;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.trips ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.clients ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.vehicles ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.drivers ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.fuel_purchases ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.hotel_locations ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.hotel_client_distances ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.hotels ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.import_logs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.trip_allowances ALTER COLUMN user_id SET NOT NULL;

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT rel.relname, con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname IN ('vehicles', 'clients')
      AND con.contype = 'u'
      AND (
        (rel.relname = 'vehicles' AND ARRAY(
          SELECT att.attname::TEXT
          FROM unnest(con.conkey) WITH ORDINALITY AS key(attnum, ordinal)
          JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = key.attnum
          ORDER BY key.ordinal
        ) = ARRAY['registration_number']::TEXT[])
        OR (rel.relname = 'clients' AND ARRAY(
          SELECT att.attname::TEXT
          FROM unnest(con.conkey) WITH ORDINALITY AS key(attnum, ordinal)
          JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = key.attnum
          ORDER BY key.ordinal
        ) = ARRAY['code']::TEXT[])
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', constraint_row.relname, constraint_row.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_user_registration_key;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_user_code_key;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_user_registration_key UNIQUE (user_id, registration_number);
ALTER TABLE public.clients ADD CONSTRAINT clients_user_code_key UNIQUE (user_id, code);

ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_user_id_id_key UNIQUE (user_id, id);
ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_id_key UNIQUE (user_id, id);
ALTER TABLE public.drivers ADD CONSTRAINT drivers_user_id_id_key UNIQUE (user_id, id);
ALTER TABLE public.trips ADD CONSTRAINT trips_user_id_id_key UNIQUE (user_id, id);
ALTER TABLE public.hotel_locations ADD CONSTRAINT hotel_locations_user_id_id_key UNIQUE (user_id, id);

ALTER TABLE public.trips ADD CONSTRAINT trips_owner_vehicle_fk
  FOREIGN KEY (user_id, vehicle_id) REFERENCES public.vehicles(user_id, id) NOT VALID;
ALTER TABLE public.trips ADD CONSTRAINT trips_owner_client_fk
  FOREIGN KEY (user_id, client_id) REFERENCES public.clients(user_id, id) NOT VALID;
ALTER TABLE public.trips ADD CONSTRAINT trips_owner_driver_fk
  FOREIGN KEY (user_id, driver_id) REFERENCES public.drivers(user_id, id) NOT VALID;
ALTER TABLE public.fuel_purchases ADD CONSTRAINT fuel_owner_trip_fk
  FOREIGN KEY (user_id, trip_id) REFERENCES public.trips(user_id, id) NOT VALID;
ALTER TABLE public.fuel_purchases ADD CONSTRAINT fuel_owner_vehicle_fk
  FOREIGN KEY (user_id, vehicle_id) REFERENCES public.vehicles(user_id, id) NOT VALID;
ALTER TABLE public.hotel_client_distances ADD CONSTRAINT hotel_distance_owner_hotel_fk
  FOREIGN KEY (user_id, hotel_id) REFERENCES public.hotel_locations(user_id, id) NOT VALID;
ALTER TABLE public.hotel_client_distances ADD CONSTRAINT hotel_distance_owner_client_fk
  FOREIGN KEY (user_id, client_id) REFERENCES public.clients(user_id, id) NOT VALID;
ALTER TABLE public.trip_allowances ADD CONSTRAINT allowances_owner_trip_fk
  FOREIGN KEY (user_id, trip_id) REFERENCES public.trips(user_id, id) NOT VALID;
ALTER TABLE public.hotels ADD CONSTRAINT hotels_owner_trip_fk
  FOREIGN KEY (user_id, trip_id) REFERENCES public.trips(user_id, id) NOT VALID;

ALTER TABLE public.trips VALIDATE CONSTRAINT trips_owner_vehicle_fk;
ALTER TABLE public.trips VALIDATE CONSTRAINT trips_owner_client_fk;
ALTER TABLE public.trips VALIDATE CONSTRAINT trips_owner_driver_fk;
ALTER TABLE public.fuel_purchases VALIDATE CONSTRAINT fuel_owner_trip_fk;
ALTER TABLE public.fuel_purchases VALIDATE CONSTRAINT fuel_owner_vehicle_fk;
ALTER TABLE public.hotel_client_distances VALIDATE CONSTRAINT hotel_distance_owner_hotel_fk;
ALTER TABLE public.hotel_client_distances VALIDATE CONSTRAINT hotel_distance_owner_client_fk;
ALTER TABLE public.trip_allowances VALIDATE CONSTRAINT allowances_owner_trip_fk;
ALTER TABLE public.hotels VALIDATE CONSTRAINT hotels_owner_trip_fk;

ALTER TABLE public.hotel_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_client_distances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotels_select ON public.hotels;
DROP POLICY IF EXISTS hotels_insert ON public.hotels;
DROP POLICY IF EXISTS hotels_update ON public.hotels;
DROP POLICY IF EXISTS hotels_delete ON public.hotels;
DROP POLICY IF EXISTS import_logs_select_own ON public.import_logs;
DROP POLICY IF EXISTS import_logs_insert_own ON public.import_logs;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
DROP POLICY IF EXISTS trip_allowances_select_own ON public.trip_allowances;
DROP POLICY IF EXISTS trip_allowances_insert_own ON public.trip_allowances;
DROP POLICY IF EXISTS trip_allowances_update_own ON public.trip_allowances;
DROP POLICY IF EXISTS trip_allowances_delete_own ON public.trip_allowances;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'trips', 'clients', 'vehicles', 'drivers', 'fuel_purchases',
    'hotel_locations', 'hotel_client_distances', 'hotels', 'import_logs',
    'trip_allowances'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_owner_select', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_owner_insert', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_owner_update', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_owner_delete', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (user_id = auth.uid())', table_name || '_owner_select', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (user_id = auth.uid())', table_name || '_owner_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', table_name || '_owner_update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (user_id = auth.uid())', table_name || '_owner_delete', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS audit_logs_owner_select ON public.audit_logs;
CREATE POLICY audit_logs_owner_select ON public.audit_logs
  FOR SELECT USING (user_id = auth.uid());

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'driver')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
