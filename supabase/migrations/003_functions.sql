-- ============================================================
-- 003_functions.sql
-- Triggers, functions, and stored procedures
-- ============================================================

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to all tables with updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profiles','vehicles','drivers','clients','trips','fuel_purchases','hotels']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
       CREATE TRIGGER trg_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- Auto-create profile on new user signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'driver')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_new_user ON auth.users;
CREATE TRIGGER trg_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Calculate trip distance and fuel used
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_trip_stats(
  p_odometer_start  NUMERIC,
  p_odometer_end    NUMERIC,
  p_fuel_start      NUMERIC,
  p_fuel_purchased  NUMERIC,
  p_fuel_end        NUMERIC
)
RETURNS TABLE (
  distance_km     NUMERIC,
  fuel_used       NUMERIC,
  avg_consumption NUMERIC
) AS $$
DECLARE
  v_distance  NUMERIC;
  v_fuel_used NUMERIC;
  v_avg       NUMERIC;
BEGIN
  -- Distance
  IF p_odometer_start IS NOT NULL AND p_odometer_end IS NOT NULL
     AND p_odometer_end >= p_odometer_start THEN
    v_distance := p_odometer_end - p_odometer_start;
  ELSE
    v_distance := NULL;
  END IF;

  -- Fuel used
  IF p_fuel_start IS NOT NULL AND p_fuel_end IS NOT NULL THEN
    v_fuel_used := p_fuel_start + COALESCE(p_fuel_purchased, 0) - p_fuel_end;
    IF v_fuel_used < 0 THEN v_fuel_used := NULL; END IF;
  ELSE
    v_fuel_used := NULL;
  END IF;

  -- Avg consumption (L/100km)
  IF v_distance IS NOT NULL AND v_distance > 0 AND v_fuel_used IS NOT NULL THEN
    v_avg := ROUND((v_fuel_used / v_distance) * 100, 2);
  ELSE
    v_avg := NULL;
  END IF;

  RETURN QUERY SELECT v_distance, v_fuel_used, v_avg;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Monthly trip summary view
-- ============================================================
CREATE OR REPLACE VIEW monthly_trip_summary AS
SELECT
  DATE_TRUNC('month', date_from)::DATE  AS month,
  vehicle_id,
  COUNT(*)                              AS trip_count,
  SUM(distance_km)                      AS total_km,
  SUM(fuel_used)                        AS total_fuel,
  CASE
    WHEN SUM(distance_km) > 0
    THEN ROUND((SUM(fuel_used) / SUM(distance_km)) * 100, 2)
    ELSE NULL
  END                                   AS avg_consumption,
  SUM(CASE WHEN hotel THEN hotel_days ELSE 0 END) AS hotel_nights,
  COUNT(CASE WHEN has_invoice THEN 1 END)          AS invoice_count
FROM trips
GROUP BY DATE_TRUNC('month', date_from), vehicle_id;

-- ============================================================
-- Client trip summary view
-- ============================================================
CREATE OR REPLACE VIEW client_trip_summary AS
SELECT
  client_id,
  COUNT(*)                                          AS total_trips,
  SUM(distance_km)                                  AS total_km,
  SUM(CASE WHEN hotel THEN hotel_days ELSE 0 END)   AS total_hotel_nights,
  COUNT(CASE WHEN has_invoice THEN 1 END)           AS total_invoices,
  MAX(date_from)                                    AS last_trip_date
FROM trips
WHERE client_id IS NOT NULL
GROUP BY client_id;
