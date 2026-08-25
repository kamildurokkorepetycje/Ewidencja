-- ============================================================
-- 009_ownership_backfill.sql
-- Backfill ownership tylko z jednoznacznych relacji.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.hotel_client_distances d
    LEFT JOIN public.hotel_locations h ON h.id = d.hotel_id
    LEFT JOIN public.clients c ON c.id = d.client_id
    WHERE h.id IS NULL OR c.id IS NULL OR h.user_id IS NULL OR c.user_id IS NULL
       OR h.user_id <> c.user_id
  ) THEN
    RAISE EXCEPTION 'Cannot backfill hotel_client_distances ownership: orphan, null owner, or cross-owner relation found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hotels h
    LEFT JOIN public.trips t ON t.id = h.trip_id
    WHERE h.trip_id IS NOT NULL AND (t.id IS NULL OR t.user_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot backfill hotels ownership: a linked trip has no owner';
  END IF;

  IF EXISTS (SELECT 1 FROM public.hotels WHERE trip_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.import_logs WHERE created_by IS NULL)
     OR EXISTS (SELECT 1 FROM public.audit_logs WHERE changed_by IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill ownership: a source owner is missing';
  END IF;
END;
$$;

UPDATE public.hotel_client_distances d
SET user_id = h.user_id
FROM public.hotel_locations h
WHERE h.id = d.hotel_id
  AND d.user_id IS NULL;

UPDATE public.hotels h
SET user_id = t.user_id
FROM public.trips t
WHERE t.id = h.trip_id
  AND h.user_id IS NULL;

UPDATE public.import_logs
SET user_id = created_by
WHERE user_id IS NULL;

UPDATE public.audit_logs
SET user_id = changed_by
WHERE user_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.hotel_client_distances WHERE user_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.hotels WHERE user_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.import_logs WHERE user_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.audit_logs WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'Ownership backfill incomplete';
  END IF;
END;
$$;
