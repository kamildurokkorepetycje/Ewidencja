-- ============================================================
-- 011_fuel_model_expand.sql
-- Rozszerza model paliwa bez zmiany pól legacy.
-- ============================================================

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS fuel_norm_used NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS fuel_adjustment_percent SMALLINT,
  ADD COLUMN IF NOT EXISTS fuel_used_exact NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS fuel_calculation_mode TEXT;

ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_fuel_adjustment_percent_check,
  DROP CONSTRAINT IF EXISTS trips_fuel_calculation_mode_check;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_fuel_adjustment_percent_check
    CHECK (fuel_adjustment_percent IS NULL OR fuel_adjustment_percent IN (0, 5, 10)),
  ADD CONSTRAINT trips_fuel_calculation_mode_check
    CHECK (fuel_calculation_mode IS NULL OR fuel_calculation_mode IN ('legacy', 'norm'));

ALTER TABLE public.fuel_purchases
  ALTER COLUMN liters TYPE NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS legacy_source_trip_id UUID REFERENCES public.trips(id),
  ADD COLUMN IF NOT EXISTS legacy_backfill_created BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS fuel_purchases_legacy_source_trip_id_key
  ON public.fuel_purchases(legacy_source_trip_id)
  WHERE legacy_source_trip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fuel_purchases_trip_date
  ON public.fuel_purchases(user_id, trip_id, date);
