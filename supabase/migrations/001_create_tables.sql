-- ============================================================
-- 001_create_tables.sql
-- Ewidencja Przejazdów — initial schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'driver' CHECK (role IN ('admin', 'manager', 'driver')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand               TEXT NOT NULL,
  model               TEXT NOT NULL,
  registration_number TEXT NOT NULL UNIQUE,
  year                INT,
  fuel_norm           NUMERIC(5,2),   -- L/100km
  tank_capacity       NUMERIC(6,1),   -- liters
  starting_mileage    NUMERIC(10,1) DEFAULT 0,
  starting_fuel       NUMERIC(6,2) DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         TEXT UNIQUE,           -- short identifier e.g. "SKL01"
  name         TEXT NOT NULL,
  city         TEXT,
  distance_km  NUMERIC(8,1),          -- standard round-trip distance
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS trips (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id        UUID REFERENCES vehicles(id),
  driver_id         UUID REFERENCES drivers(id),
  client_id         UUID REFERENCES clients(id),

  trip_type         TEXT NOT NULL DEFAULT 'służbowy' CHECK (trip_type IN ('służbowy', 'prywatny', 'mieszany')),

  date_from         DATE NOT NULL,
  date_to           DATE NOT NULL,

  -- Odometer
  odometer_start    NUMERIC(10,1),
  odometer_end      NUMERIC(10,1),
  distance_km       NUMERIC(8,1),    -- calculated: sum of trip legs km
  local_km          NUMERIC(8,1),    -- km within city (added to odometer start)

  -- Trip legs (route table)
  trip_legs         JSONB,           -- [{day,from,to,km}]

  -- Card
  card_number       TEXT,

  -- Fuel
  fuel_start        NUMERIC(6,2),    -- fuel level at start (L)
  fuel_purchased    NUMERIC(6,2) DEFAULT 0,
  fuel_end          NUMERIC(6,2),    -- fuel level at end (L)
  fuel_used         NUMERIC(6,2),    -- calculated: fuel_start + fuel_purchased - fuel_end
  avg_consumption   NUMERIC(5,2),    -- calculated: L/100km

  -- Invoice / billing
  has_invoice       BOOLEAN NOT NULL DEFAULT FALSE,
  invoice_number    TEXT,
  invoice_date      DATE,

  -- Hotel
  hotel             BOOLEAN NOT NULL DEFAULT FALSE,
  hotel_days        INT DEFAULT 0,

  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUEL_PURCHASES (standalone fuel invoices)
-- ============================================================
CREATE TABLE IF NOT EXISTS fuel_purchases (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id     UUID REFERENCES vehicles(id),
  trip_id        UUID REFERENCES trips(id),
  date           DATE NOT NULL,
  liters         NUMERIC(7,2),
  amount_gross   NUMERIC(10,2),
  invoice_number TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HOTEL_LOCATIONS (lista hoteli z odległościami)
-- ============================================================
CREATE TABLE IF NOT EXISTS hotel_locations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  city         TEXT,
  distance_km  NUMERIC(8,1),          -- km hotel → miasto klienta (domyślne)
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_locations_name ON hotel_locations(name);

-- ============================================================
-- HOTELS (standalone hotel invoices — optional module)
-- ============================================================
CREATE TABLE IF NOT EXISTS hotels (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id        UUID REFERENCES trips(id),
  hotel_name     TEXT,
  city           TEXT,
  date_from      DATE,
  date_to        DATE,
  nights         INT,
  amount_gross   NUMERIC(10,2),
  invoice_number TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- IMPORT_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS import_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_type  TEXT NOT NULL,   -- 'clients' | 'trips'
  filename     TEXT,
  total_rows   INT DEFAULT 0,
  imported     INT DEFAULT 0,
  failed       INT DEFAULT 0,
  errors       JSONB DEFAULT '[]',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name  TEXT NOT NULL,
  record_id   UUID,
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID REFERENCES auth.users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_trips_date_from       ON trips(date_from);
CREATE INDEX IF NOT EXISTS idx_trips_date_to         ON trips(date_to);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id      ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id       ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_client_id       ON trips(client_id);
CREATE INDEX IF NOT EXISTS idx_trips_invoice_number  ON trips(invoice_number);
CREATE INDEX IF NOT EXISTS idx_fuel_vehicle_id       ON fuel_purchases(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_trip_id          ON fuel_purchases(trip_id);
CREATE INDEX IF NOT EXISTS idx_clients_code          ON clients(code);
CREATE INDEX IF NOT EXISTS idx_clients_name          ON clients(name);
