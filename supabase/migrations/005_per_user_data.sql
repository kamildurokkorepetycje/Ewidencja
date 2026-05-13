-- ============================================================
-- 005_per_user_data.sql
-- Izolacja danych per użytkownik
-- Każdy użytkownik widzi i modyfikuje tylko swoje dane
-- ============================================================

-- ── 1. Dodaj kolumnę user_id do tabel ────────────────────────

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE trips ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE clients ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE fuel_purchases
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE fuel_purchases ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE hotel_locations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE hotel_locations ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE vehicles ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE drivers ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ── 2. Indeksy dla wydajności ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trips_user_id            ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id          ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_fuel_purchases_user_id   ON fuel_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_hotel_locations_user_id  ON hotel_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id         ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id          ON drivers(user_id);

-- ── 3. Usuń stare, zbyt liberalne polityki RLS ────────────────

-- TRIPS
DROP POLICY IF EXISTS "trips_select" ON trips;
DROP POLICY IF EXISTS "trips_insert" ON trips;
DROP POLICY IF EXISTS "trips_update" ON trips;
DROP POLICY IF EXISTS "trips_delete" ON trips;

-- CLIENTS
DROP POLICY IF EXISTS "clients_select" ON clients;
DROP POLICY IF EXISTS "clients_insert" ON clients;
DROP POLICY IF EXISTS "clients_update" ON clients;
DROP POLICY IF EXISTS "clients_delete" ON clients;

-- FUEL_PURCHASES
DROP POLICY IF EXISTS "fuel_select" ON fuel_purchases;
DROP POLICY IF EXISTS "fuel_insert" ON fuel_purchases;
DROP POLICY IF EXISTS "fuel_update" ON fuel_purchases;
DROP POLICY IF EXISTS "fuel_delete" ON fuel_purchases;

-- HOTELS (hotel_locations)
DROP POLICY IF EXISTS "hotels_select" ON hotel_locations;
DROP POLICY IF EXISTS "hotels_insert" ON hotel_locations;
DROP POLICY IF EXISTS "hotels_update" ON hotel_locations;
DROP POLICY IF EXISTS "hotels_delete" ON hotel_locations;

-- VEHICLES
DROP POLICY IF EXISTS "vehicles_select" ON vehicles;
DROP POLICY IF EXISTS "vehicles_insert" ON vehicles;
DROP POLICY IF EXISTS "vehicles_update" ON vehicles;
DROP POLICY IF EXISTS "vehicles_delete" ON vehicles;

-- DRIVERS
DROP POLICY IF EXISTS "drivers_select" ON drivers;
DROP POLICY IF EXISTS "drivers_insert" ON drivers;
DROP POLICY IF EXISTS "drivers_update" ON drivers;
DROP POLICY IF EXISTS "drivers_delete" ON drivers;

-- ── 4. Nowe polityki RLS — tylko własne dane ──────────────────

-- Usuń _own polityki jeśli już istnieją (idempotentność)
DROP POLICY IF EXISTS "trips_select_own" ON trips;
DROP POLICY IF EXISTS "trips_insert_own" ON trips;
DROP POLICY IF EXISTS "trips_update_own" ON trips;
DROP POLICY IF EXISTS "trips_delete_own" ON trips;

DROP POLICY IF EXISTS "clients_select_own" ON clients;
DROP POLICY IF EXISTS "clients_insert_own" ON clients;
DROP POLICY IF EXISTS "clients_update_own" ON clients;
DROP POLICY IF EXISTS "clients_delete_own" ON clients;

DROP POLICY IF EXISTS "fuel_select_own" ON fuel_purchases;
DROP POLICY IF EXISTS "fuel_insert_own" ON fuel_purchases;
DROP POLICY IF EXISTS "fuel_update_own" ON fuel_purchases;
DROP POLICY IF EXISTS "fuel_delete_own" ON fuel_purchases;

DROP POLICY IF EXISTS "hotel_locations_select_own" ON hotel_locations;
DROP POLICY IF EXISTS "hotel_locations_insert_own" ON hotel_locations;
DROP POLICY IF EXISTS "hotel_locations_update_own" ON hotel_locations;
DROP POLICY IF EXISTS "hotel_locations_delete_own" ON hotel_locations;

DROP POLICY IF EXISTS "vehicles_select_own" ON vehicles;
DROP POLICY IF EXISTS "vehicles_insert_own" ON vehicles;
DROP POLICY IF EXISTS "vehicles_update_own" ON vehicles;
DROP POLICY IF EXISTS "vehicles_delete_own" ON vehicles;

DROP POLICY IF EXISTS "drivers_select_own" ON drivers;
DROP POLICY IF EXISTS "drivers_insert_own" ON drivers;
DROP POLICY IF EXISTS "drivers_update_own" ON drivers;
DROP POLICY IF EXISTS "drivers_delete_own" ON drivers;

-- TRIPS
CREATE POLICY "trips_select_own" ON trips
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "trips_insert_own" ON trips
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "trips_update_own" ON trips
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "trips_delete_own" ON trips
  FOR DELETE USING (user_id = auth.uid());

-- CLIENTS
CREATE POLICY "clients_select_own" ON clients
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "clients_insert_own" ON clients
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "clients_update_own" ON clients
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "clients_delete_own" ON clients
  FOR DELETE USING (user_id = auth.uid());

-- FUEL_PURCHASES
CREATE POLICY "fuel_select_own" ON fuel_purchases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "fuel_insert_own" ON fuel_purchases
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "fuel_update_own" ON fuel_purchases
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "fuel_delete_own" ON fuel_purchases
  FOR DELETE USING (user_id = auth.uid());

-- HOTEL_LOCATIONS
CREATE POLICY "hotel_locations_select_own" ON hotel_locations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "hotel_locations_insert_own" ON hotel_locations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "hotel_locations_update_own" ON hotel_locations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "hotel_locations_delete_own" ON hotel_locations
  FOR DELETE USING (user_id = auth.uid());

-- VEHICLES
CREATE POLICY "vehicles_select_own" ON vehicles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "vehicles_insert_own" ON vehicles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "vehicles_update_own" ON vehicles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "vehicles_delete_own" ON vehicles
  FOR DELETE USING (user_id = auth.uid());

-- DRIVERS
CREATE POLICY "drivers_select_own" ON drivers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "drivers_insert_own" ON drivers
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "drivers_update_own" ON drivers
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "drivers_delete_own" ON drivers
  FOR DELETE USING (user_id = auth.uid());
