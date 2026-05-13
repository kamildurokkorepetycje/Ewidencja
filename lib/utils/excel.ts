import * as XLSX from 'xlsx'
import { Client, Trip, Vehicle, Driver } from '@/lib/types'

export interface ExcelRow {
  [key: string]: string | number | boolean | null | undefined
}

/**
 * Wczytuje plik Excel i zwraca dane z arkuszy
 */
export async function parseExcelFile(file: File): Promise<{
  sheets: string[]
  data: Record<string, ExcelRow[]>
}> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheets = workbook.SheetNames
  const data: Record<string, ExcelRow[]> = {}

  for (const sheetName of sheets) {
    const worksheet = workbook.Sheets[sheetName]
    data[sheetName] = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
      defval: null,
      raw: false,
      dateNF: 'yyyy-mm-dd'
    })
  }

  return { sheets, data }
}

/**
 * Eksportuje przejazdy do pliku Excel
 */
export function exportTripsToExcel(trips: Trip[], filename = 'przejazdy.xlsx'): void {
  const rows = trips.map((t) => ({
    'Data od': t.date_from,
    'Data do': t.date_to,
    'Typ': t.trip_type,
    'Kierowca': t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : '',
    'Pojazd': t.vehicle ? `${t.vehicle.brand} ${t.vehicle.model}` : '',
    'Nr rejestracyjny': t.vehicle?.registration_number ?? '',
    'Kod klienta': t.client?.code ?? '',
    'Klient': t.client?.name ?? '',
    'Miejscowość': t.client?.city ?? '',
    'Karta / POP': t.card_number ?? '',
    'Licznik początkowy': t.odometer_start ?? '',
    'Licznik końcowy': t.odometer_end ?? '',
    'Kilometry': t.distance_km ?? '',
    'Km lokalne': t.local_km ?? '',
    'Paliwo początkowe': t.fuel_start ?? '',
    'Zakup paliwa': t.fuel_purchased ?? '',
    'Paliwo końcowe': t.fuel_end ?? '',
    'Zużyte paliwo': t.fuel_used ?? '',
    'Nr faktury': t.invoice_number ?? '',
    'Hotel': t.hotel ? 'Tak' : 'Nie',
    'Noclegi': t.hotel_days ?? '',
    'Uwagi': t.notes ?? ''
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Przejazdy')
  XLSX.writeFile(wb, filename)
}

/**
 * Eksportuje klientów do pliku Excel
 */
export function exportClientsToExcel(clients: Client[], filename = 'klienci.xlsx'): void {
  const rows = clients.map((c) => ({
    'Kod': c.code ?? '',
    'Nazwa': c.name,
    'Miejscowość': c.city ?? '',
    'Odległość km': c.distance_km ?? '',
    'Aktywny': c.is_active ? 'Tak' : 'Nie',
    'Uwagi': c.notes ?? ''
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Klienci')
  XLSX.writeFile(wb, filename)
}

/**
 * Eksportuje dane do pliku CSV
 */
export function exportToCSV(data: ExcelRow[], filename = 'export.csv'): void {
  if (data.length === 0) return

  const headers = Object.keys(data[0])
  const csvRows = [
    headers.join(';'),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h]
          if (val == null) return ''
          const str = String(val)
          if (str.includes(';') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        })
        .join(';')
    )
  ]

  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], {
    type: 'text/csv;charset=utf-8;'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Mapuje wiersz Excela na dane klienta
 */
export function mapExcelRowToClient(
  row: ExcelRow,
  mapping: Record<string, string>
): Partial<Client> {
  return {
    code: String(row[mapping.code] ?? '').trim() || null,
    name: String(row[mapping.name] ?? '').trim(),
    city: String(row[mapping.city] ?? '').trim() || null,
    distance_km: row[mapping.distance_km] ? parseFloat(String(row[mapping.distance_km])) : null,
    is_active: true
  }
}

/**
 * Mapuje wiersz Excela na dane przejazdu
 */
export function mapExcelRowToTrip(
  row: ExcelRow,
  mapping: Record<string, string>
): Partial<Trip> {
  const parseNum = (val: unknown) => {
    if (val == null || val === '') return null
    const n = parseFloat(String(val).replace(',', '.'))
    return isNaN(n) ? null : n
  }

  const parseDate = (val: unknown): string | null => {
    if (!val) return null
    const str = String(val).trim()
    // Try to parse common date formats
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) return str.substring(0, 10)
    const plMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
    if (plMatch) return `${plMatch[3]}-${plMatch[2]}-${plMatch[1]}`
    return null
  }

  return {
    date_from: parseDate(row[mapping.date_from]) ?? undefined,
    date_to: parseDate(row[mapping.date_to]) ?? undefined,
    trip_type: String(row[mapping.trip_type] ?? '').toLowerCase().includes('pryw') ? 'prywatny' : 'służbowy',
    card_number: String(row[mapping.card_number] ?? '').trim() || null,
    odometer_start: parseNum(row[mapping.odometer_start]),
    odometer_end: parseNum(row[mapping.odometer_end]),
    distance_km: parseNum(row[mapping.distance_km]),
    local_km: parseNum(row[mapping.local_km]),
    fuel_start: parseNum(row[mapping.fuel_start]),
    fuel_purchased: parseNum(row[mapping.fuel_purchased]),
    fuel_end: parseNum(row[mapping.fuel_end]),
    fuel_used: parseNum(row[mapping.fuel_used]),
    invoice_number: String(row[mapping.invoice_number] ?? '').trim() || null,
    hotel: Boolean(row[mapping.hotel]),
    notes: String(row[mapping.notes] ?? '').trim() || null
  } as Partial<Trip>
}

/**
 * Wykrywa kolumny w arkuszu Excel
 */
export function detectColumns(rows: ExcelRow[]): string[] {
  if (rows.length === 0) return []
  return Object.keys(rows[0])
}

/**
 * Sugerowane mapowanie kolumn dla przejazdów
 */
export const TRIP_COLUMN_SUGGESTIONS: Record<string, string[]> = {
  date_from: ['data od', 'data_od', 'date from', 'od', 'data wyjazdu', 'data'],
  date_to: ['data do', 'data_do', 'date to', 'do', 'data powrotu'],
  trip_type: ['typ', 'type', 'rodzaj', 'typ przejazdu'],
  card_number: ['karta', 'pop', 'nr karty', 'karta/pop'],
  odometer_start: ['licznik pocz', 'km od', 'stan licznika od', 'odometer start', 'licznik_start'],
  odometer_end: ['licznik kon', 'km do', 'stan licznika do', 'odometer end', 'licznik_end'],
  distance_km: ['km', 'kilometry', 'odległość', 'trasa', 'przebieg'],
  local_km: ['km lokalne', 'local km', 'lokalne'],
  fuel_start: ['paliwo od', 'paliwo pocz', 'fuel start'],
  fuel_purchased: ['tankowanie', 'zakup paliwa', 'paliwo', 'litry', 'fuel'],
  fuel_end: ['paliwo do', 'paliwo kon', 'fuel end'],
  fuel_used: ['zużyte', 'zużycie paliwa', 'fuel used'],
  invoice_number: ['faktura', 'nr faktury', 'invoice', 'fv'],
  hotel: ['hotel', 'nocleg', 'noclegi'],
  notes: ['uwagi', 'notes', 'komentarz', 'opis']
}

/**
 * Sugerowane mapowanie kolumn dla klientów
 */
export const CLIENT_COLUMN_SUGGESTIONS: Record<string, string[]> = {
  code: ['kod', 'code', 'id klienta', 'symbol'],
  name: ['nazwa', 'name', 'klient', 'firma', 'kontrahent'],
  city: ['miejscowość', 'city', 'miasto', 'adres'],
  distance_km: ['odległość', 'km', 'distance', 'trasa']
}

/**
 * Automatycznie wykrywa mapowanie kolumn
 */
export function autoDetectMapping(
  columns: string[],
  suggestions: Record<string, string[]>
): Record<string, string> {
  const mapping: Record<string, string> = {}

  for (const [field, hints] of Object.entries(suggestions)) {
    const col = columns.find((c) =>
      hints.some((hint) => c.toLowerCase().includes(hint.toLowerCase()))
    )
    mapping[field] = col ?? ''
  }

  return mapping
}
