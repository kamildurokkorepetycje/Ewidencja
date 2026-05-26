-- ============================================================
-- 007_trip_allowances.sql
-- Dzienne diety przejazdow: panstwowe i firmowe
-- ============================================================

CREATE TABLE IF NOT EXISTS trip_allowances (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  day             DATE NOT NULL,
  allowance_type  TEXT NOT NULL CHECK (allowance_type IN ('state', 'company')),
  amount          NUMERIC(10,2),
  currency        TEXT NOT NULL DEFAULT 'PLN',

  -- Diety panstwowe sa wyplacane do reki.
  is_paid         BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at         TIMESTAMPTZ,
  paid_by         UUID REFERENCES auth.users(id),
  payment_note    TEXT,

  -- Diety firmowe sa rozliczane miesiecznie.
  settlement_year  INT,
  settlement_month INT,
  is_settled       BOOLEAN NOT NULL DEFAULT FALSE,
  settled_at       TIMESTAMPTZ,

  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (trip_id, day, allowance_type)
);

CREATE INDEX IF NOT EXISTS idx_trip_allowances_trip_id ON trip_allowances(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_allowances_user_id ON trip_allowances(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_allowances_day ON trip_allowances(day);
CREATE INDEX IF NOT EXISTS idx_trip_allowances_type ON trip_allowances(allowance_type);
CREATE INDEX IF NOT EXISTS idx_trip_allowances_company_settlement
  ON trip_allowances(user_id, settlement_year, settlement_month)
  WHERE allowance_type = 'company';

ALTER TABLE trip_allowances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_allowances_select_own" ON trip_allowances;
DROP POLICY IF EXISTS "trip_allowances_insert_own" ON trip_allowances;
DROP POLICY IF EXISTS "trip_allowances_update_own" ON trip_allowances;
DROP POLICY IF EXISTS "trip_allowances_delete_own" ON trip_allowances;

CREATE POLICY "trip_allowances_select_own" ON trip_allowances
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "trip_allowances_insert_own" ON trip_allowances
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "trip_allowances_update_own" ON trip_allowances
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "trip_allowances_delete_own" ON trip_allowances
  FOR DELETE USING (user_id = auth.uid());
