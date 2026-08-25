-- ============================================================
-- 014_revoke_direct_trip_dml.sql
-- RĘCZNY GATE PO PRZEŁĄCZENIU API NA ATOMOWE RPC.
-- Nie jest automatyczną migracją i nie uruchamiaj go teraz.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF current_setting('app.allow_direct_trip_dml_revoke', TRUE) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'Set LOCAL app.allow_direct_trip_dml_revoke = ''on'' only after the RPC API rollout has passed its integration tests.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'save_trip_with_children'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'save_trip_with_children SECURITY DEFINER RPC is missing';
  END IF;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON public.trips FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fuel_purchases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.trip_allowances FROM authenticated;

COMMIT;
