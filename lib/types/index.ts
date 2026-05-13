export type TripType = 'służbowy' | 'prywatny'
export type UserRole = 'admin' | 'kierowca' | 'podgląd'

export interface TripLeg {
  day: string       // ISO date e.g. '2026-05-11'
  from: string
  to: string
  km: number
  hotel_id?: string | null   // opcjonalnie powiązany hotel
}

export interface HotelLocation {
  id: string
  name: string
  city: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface HotelClientDistance {
  id: string
  hotel_id: string
  client_id: string
  distance_km: number | null
  created_at: string
  client?: {
    id: string
    name: string
    code: string | null
    city: string | null
  }
}

export interface UserProfile {
  id: string
  user_id: string
  full_name: string | null
  role: UserRole
  created_at: string
}

export interface Vehicle {
  id: string
  brand: string
  model: string
  registration_number: string
  year: number | null
  fuel_norm: number | null
  tank_capacity: number | null
  starting_mileage: number | null
  starting_fuel: number | null
  is_active: boolean
  created_at: string
}

export interface Driver {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface Client {
  id: string
  code: string | null
  name: string
  city: string | null
  distance_km: number | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface Trip {
  id: string
  date_from: string
  date_to: string
  trip_type: TripType
  vehicle_id: string | null
  driver_id: string | null
  client_id: string | null
  card_number: string | null
  odometer_start: number | null
  odometer_end: number | null
  distance_km: number | null
  local_km: number | null
  trip_legs: TripLeg[] | null
  fuel_start: number | null
  fuel_purchased: number | null
  fuel_end: number | null
  fuel_used: number | null
  invoice_number: string | null
  hotel: boolean
  hotel_days: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined fields
  vehicle?: Vehicle
  driver?: Driver
  client?: Client
  errors?: TripError[]
}

export interface TripError {
  field: string
  message: string
  severity: 'error' | 'warning'
}

export interface FuelPurchase {
  id: string
  trip_id: string | null
  vehicle_id: string | null
  date: string
  liters: number | null
  amount_gross: number | null
  invoice_number: string | null
  notes: string | null
  created_at: string
  // Joined fields
  vehicle?: Vehicle
  trip?: Trip
}

export interface Hotel {
  id: string
  trip_id: string | null
  date: string
  city: string | null
  nights: number | null
  amount_gross: number | null
  notes: string | null
  created_at: string
  // Joined fields
  trip?: Trip
}

export interface ImportLog {
  id: string
  file_name: string
  import_type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  rows_total: number | null
  rows_imported: number | null
  rows_failed: number | null
  error_report: ImportError[] | null
  created_by: string | null
  created_at: string
}

export interface ImportError {
  row: number
  field: string
  message: string
  data?: Record<string, unknown>
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
}

// Form types
export interface TripFormData {
  date_from: string
  date_to: string
  trip_type: TripType
  vehicle_id: string
  driver_id: string
  client_id: string
  card_number: string
  odometer_start: string
  odometer_end: string
  local_km: string
  fuel_start: string
  fuel_purchased: string
  fuel_end: string
  invoice_number: string
  hotel: boolean
  hotel_days: string
  notes: string
}

export interface ClientFormData {
  code: string
  name: string
  city: string
  distance_km: string
  is_active: boolean
  notes: string
}

export interface VehicleFormData {
  brand: string
  model: string
  registration_number: string
  year: string
  fuel_norm: string
  tank_capacity: string
  starting_mileage: string
  starting_fuel: string
  is_active: boolean
}

export interface DriverFormData {
  first_name: string
  last_name: string
  email: string
  phone: string
  is_active: boolean
}

export interface FuelFormData {
  trip_id: string
  vehicle_id: string
  date: string
  liters: string
  amount_gross: string
  invoice_number: string
  notes: string
}

// Report types
export interface MonthlyReport {
  year: number
  month: number
  trip_count: number
  trips: Trip[]
  total_km: number
  business_km: number
  private_km: number
  local_km: number
  total_fuel: number
  avg_consumption: number | null
  invoice_count: number
  hotel_count: number
  night_count: number
  top_clients: { client: Client; visits: number; km: number }[]
  errors: TripError[]
}

export interface AnnualReport {
  year: number
  total_km: number
  total_fuel: number
  avg_consumption: number | null
  trip_count: number
  invoice_count: number
  hotel_count: number
  monthly_data: {
    month: number
    km: number
    fuel: number
    trips: number
  }[]
  top_clients: { client: Client; visits: number; km: number }[]
}

// Filter types
export interface TripFilters {
  date_from?: string
  date_to?: string
  trip_type?: TripType | ''
  client_id?: string
  vehicle_id?: string
  driver_id?: string
  card_number?: string
  has_invoice?: boolean | null
  has_hotel?: boolean | null
  has_errors?: boolean | null
  search?: string
}

// Dashboard stats
export interface DashboardStats {
  trip_count: number
  total_km: number
  business_km: number
  private_km: number
  local_km: number
  total_fuel: number
  avg_consumption: number | null
  invoice_count: number
  hotel_count: number
  top_clients: { client: Client; visits: number }[]
  error_count: number
}
