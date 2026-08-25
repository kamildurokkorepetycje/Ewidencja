-- ============================================================
-- 008_ownership_expand.sql
-- Rozszerzenie ownership bez modyfikacji danych biznesowych.
-- Wykonuj tylko lokalnie albo po ręcznym pre-checku środowiska.
-- ============================================================

ALTER TABLE public.hotel_client_distances
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.import_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hotel_client_distances_user_id
  ON public.hotel_client_distances(user_id);
CREATE INDEX IF NOT EXISTS idx_hotels_user_id ON public.hotels(user_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_user_id ON public.import_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
