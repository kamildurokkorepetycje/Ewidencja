import { Trip } from '@/lib/types'
import { formatDate, formatKm, formatLiters, getMonthName } from './formatting'

/**
 * Generuje PDF raportu miesięcznego
 * Dynamically imported to avoid SSR issues
 */
export async function generateMonthlyReportPDF(
  trips: Trip[],
  year: number,
  month: number
): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Title
  doc.setFontSize(16)
  doc.text(`Raport miesięczny – ${getMonthName(month)} ${year}`, 15, 15)

  // Stats
  const totalKm = trips.reduce((s, t) => s + (t.distance_km ?? 0), 0)
  const totalFuel = trips.reduce((s, t) => s + (t.fuel_purchased ?? 0), 0)
  doc.setFontSize(10)
  doc.text(`Liczba przejazdów: ${trips.length}   Suma km: ${totalKm}   Zakup paliwa: ${totalFuel.toFixed(2)} L`, 15, 25)

  // Table
  autoTable(doc, {
    startY: 30,
    head: [[
      'Data od', 'Data do', 'Typ', 'Klient', 'Pojazd',
      'Km', 'Paliwo', 'Faktura', 'Hotel', 'Uwagi'
    ]],
    body: trips.map((t) => [
      formatDate(t.date_from),
      formatDate(t.date_to),
      t.trip_type,
      t.client?.name ?? '-',
      t.vehicle ? `${t.vehicle.brand} ${t.vehicle.model}` : '-',
      formatKm(t.distance_km),
      formatLiters(t.fuel_purchased),
      t.invoice_number ?? '-',
      t.hotel ? 'Tak' : 'Nie',
      t.notes ?? ''
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] }
  })

  doc.save(`raport-${year}-${String(month).padStart(2, '0')}.pdf`)
}
