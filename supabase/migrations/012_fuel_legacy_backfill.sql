-- ============================================================
-- 012_fuel_legacy_backfill.sql
-- Oznacza istniejące tankowania legacy i tworzy wyłącznie pewne braki.
-- ============================================================

CREATE TEMP TABLE legacy_fuel_candidates ON COMMIT DROP AS
SELECT
  t.id AS trip_id,
  t.user_id,
  t.vehicle_id,
  COALESCE(t.invoice_date, t.date_from) AS purchase_date,
  t.fuel_purchased,
  t.invoice_number,
  (
    SELECT count(*)
    FROM public.fuel_purchases p
    WHERE p.trip_id = t.id
      AND p.user_id = t.user_id
      AND p.vehicle_id = t.vehicle_id
      AND p.liters IS NOT DISTINCT FROM t.fuel_purchased
      AND p.invoice_number IS NOT DISTINCT FROM t.invoice_number
      AND p.date = COALESCE(t.invoice_date, t.date_from)
  ) AS exact_match_count,
  (
    SELECT count(*)
    FROM public.fuel_purchases p
    WHERE p.trip_id IS NULL
      AND p.user_id = t.user_id
      AND p.vehicle_id = t.vehicle_id
      AND p.liters IS NOT DISTINCT FROM t.fuel_purchased
      AND p.invoice_number IS NOT DISTINCT FROM t.invoice_number
      AND p.date = COALESCE(t.invoice_date, t.date_from)
  ) AS standalone_match_count
FROM public.trips t
WHERE COALESCE(t.fuel_purchased, 0) > 0
   OR t.invoice_number IS NOT NULL
   OR t.has_invoice = TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM legacy_fuel_candidates c
    WHERE c.exact_match_count > 1
       OR (c.exact_match_count = 0 AND c.standalone_match_count > 0)
  ) THEN
    RAISE EXCEPTION 'Legacy fuel classification is ambiguous; no records were changed';
  END IF;
END;
$$;

UPDATE public.trips t
SET fuel_used_exact = t.fuel_used,
    fuel_calculation_mode = 'legacy'
WHERE t.id IN (SELECT trip_id FROM legacy_fuel_candidates)
  AND t.fuel_calculation_mode IS NULL;

UPDATE public.fuel_purchases p
SET legacy_source_trip_id = c.trip_id,
    legacy_backfill_created = FALSE
FROM legacy_fuel_candidates c
WHERE c.exact_match_count = 1
  AND p.trip_id = c.trip_id
  AND p.user_id = c.user_id
  AND p.vehicle_id = c.vehicle_id
  AND p.liters IS NOT DISTINCT FROM c.fuel_purchased
  AND p.invoice_number IS NOT DISTINCT FROM c.invoice_number
  AND p.date = c.purchase_date
  AND p.legacy_source_trip_id IS NULL;

INSERT INTO public.fuel_purchases (
  user_id, trip_id, vehicle_id, date, liters, invoice_number,
  legacy_source_trip_id, legacy_backfill_created
)
SELECT
  user_id, trip_id, vehicle_id, purchase_date, fuel_purchased, invoice_number,
  trip_id, TRUE
FROM legacy_fuel_candidates
WHERE exact_match_count = 0
  AND standalone_match_count = 0
ON CONFLICT (legacy_source_trip_id) WHERE legacy_source_trip_id IS NOT NULL DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM legacy_fuel_candidates c
    LEFT JOIN public.fuel_purchases p ON p.legacy_source_trip_id = c.trip_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy fuel backfill did not create exactly one provenance link per trip';
  END IF;
END;
$$;
