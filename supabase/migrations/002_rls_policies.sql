-- ============================================================
-- 002_rls_policies.sql
-- Row Level Security for all tables
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper function: get current user role
-- ============================================================
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES
-- ============================================================
-- Users can read and update their own profile
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (current_user_role() = 'admin');

-- ============================================================
-- VEHICLES — all authenticated users can read; admin/manager can write
-- ============================================================
CREATE POLICY "vehicles_select" ON vehicles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "vehicles_insert" ON vehicles
  FOR INSERT WITH CHECK (current_user_role() IN ('admin', 'manager'));

CREATE POLICY "vehicles_update" ON vehicles
  FOR UPDATE USING (current_user_role() IN ('admin', 'manager'));

CREATE POLICY "vehicles_delete" ON vehicles
  FOR DELETE USING (current_user_role() = 'admin');

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE POLICY "drivers_select" ON drivers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "drivers_insert" ON drivers
  FOR INSERT WITH CHECK (current_user_role() IN ('admin', 'manager'));

CREATE POLICY "drivers_update" ON drivers
  FOR UPDATE USING (current_user_role() IN ('admin', 'manager'));

CREATE POLICY "drivers_delete" ON drivers
  FOR DELETE USING (current_user_role() = 'admin');

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE POLICY "clients_select" ON clients
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "clients_insert" ON clients
  FOR INSERT WITH CHECK (current_user_role() IN ('admin', 'manager'));

CREATE POLICY "clients_update" ON clients
  FOR UPDATE USING (current_user_role() IN ('admin', 'manager'));

CREATE POLICY "clients_delete" ON clients
  FOR DELETE USING (current_user_role() = 'admin');

-- ============================================================
-- TRIPS
-- ============================================================
CREATE POLICY "trips_select" ON trips
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "trips_insert" ON trips
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "trips_update" ON trips
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "trips_delete" ON trips
  FOR DELETE USING (current_user_role() IN ('admin', 'manager'));

-- ============================================================
-- FUEL_PURCHASES
-- ============================================================
CREATE POLICY "fuel_select" ON fuel_purchases
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "fuel_insert" ON fuel_purchases
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "fuel_update" ON fuel_purchases
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "fuel_delete" ON fuel_purchases
  FOR DELETE USING (current_user_role() IN ('admin', 'manager'));

-- ============================================================
-- HOTELS
-- ============================================================
CREATE POLICY "hotels_select" ON hotels
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "hotels_insert" ON hotels
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "hotels_update" ON hotels
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "hotels_delete" ON hotels
  FOR DELETE USING (current_user_role() IN ('admin', 'manager'));

-- ============================================================
-- IMPORT_LOGS — all users can read their own; admin reads all
-- ============================================================
CREATE POLICY "import_logs_select_own" ON import_logs
  FOR SELECT USING (created_by = auth.uid() OR current_user_role() = 'admin');

CREATE POLICY "import_logs_insert" ON import_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- AUDIT_LOGS — admin only
-- ============================================================
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (current_user_role() = 'admin');

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
