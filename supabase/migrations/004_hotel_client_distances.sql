-- ============================================================
-- 004_hotel_client_distances.sql
-- Powiązanie hoteli z klientami + odległości
-- ============================================================

CREATE TABLE IF NOT EXISTS hotel_client_distances (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID NOT NULL REFERENCES hotel_locations(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  distance_km NUMERIC(8,1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hotel_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_client_hotel ON hotel_client_distances(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_client_client ON hotel_client_distances(client_id);
