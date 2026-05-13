-- ============================================================
-- 006_add_missing_columns.sql
-- Dodaje brakujące kolumny których może nie być w bazie
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS card_number      TEXT,
  ADD COLUMN IF NOT EXISTS local_km         NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS trip_legs        JSONB,
  ADD COLUMN IF NOT EXISTS odometer_start   NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS odometer_end     NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS distance_km      NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS fuel_start       NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS fuel_purchased   NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuel_end         NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS fuel_used        NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS avg_consumption  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS has_invoice      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_number   TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date     DATE,
  ADD COLUMN IF NOT EXISTS hotel            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hotel_days       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS created_by       UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();
