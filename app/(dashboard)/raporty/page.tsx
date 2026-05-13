'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { Spinner } from '@/components/ui/Spinner'
import { StatCard } from '@/components/ui/Card'
import { formatKm, formatLiters, formatConsumption, formatDate, getMonthName } from '@/lib/utils/formatting'
import { exportTripsToExcel, exportToCSV } from '@/lib/utils/excel'
import { generateMonthlyReportPDF } from '@/lib/utils/export'
import type { MonthlyReport } from '@/lib/types'
import { FileDown, FileSpreadsheet, FileText, BarChart3, Route, Fuel, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1)
}))

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - i),
  label: String(currentYear - i)
}))

export default function RaportyPage() {
  const [year, setYear] = useState(String(currentYear))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState<'pdf' | 'excel' | 'csv' | null>(null)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports?year=${year}&month=${month}`)
      const payload = await res.json()
      setReport(payload.data ?? payload)
    } catch {
      toast.error('Błąd pobierania raportu')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchReport() }, [fetchReport])

  const handleExportPDF = async () => {
    if (!report?.trips) return
    setExportLoading('pdf')
    try {
      await generateMonthlyReportPDF(report.trips, parseInt(year), parseInt(month))
      toast.success('PDF wygenerowany')
    } catch {
      toast.error('Błąd generowania PDF')
    } finally {
      setExportLoading(null)
    }
  }

  const handleExportExcel = () => {
    if (!report?.trips) return
    setExportLoading('excel')
    try {
      exportTripsToExcel(report.trips, `raport-${year}-${month.padStart(2, '0')}`)
      toast.success('Plik Excel pobrany')
    } catch {
      toast.error('Błąd exportu Excel')
    } finally {
      setExportLoading(null)
    }
  }

  const handleExportCSV = () => {
    if (!report?.trips) return
    setExportLoading('csv')
    try {
      const rows = report.trips.map((t) => ({
        Data_od: t.date_from,
        Data_do: t.date_to,
        Klient: t.client?.name ?? '',
        Pojazd: t.vehicle ? `${t.vehicle.brand} ${t.vehicle.model} ${t.vehicle.registration_number}` : '',
        Km: t.distance_km ?? '',
        Paliwo_L: t.fuel_used ?? '',
        Hotel: t.hotel ? 'Tak' : 'Nie',
        Noclegi: t.hotel_days ?? '',
        Faktura: t.invoice_number ?? ''
      }))
      exportToCSV(rows, `raport-${year}-${month.padStart(2, '0')}`)
      toast.success('CSV pobrany')
    } catch {
      toast.error('Błąd exportu CSV')
    } finally {
      setExportLoading(null)
    }
  }

  return (
    <div>
      <Header
        title="Raporty"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              loading={exportLoading === 'pdf'}
              disabled={!report?.trips?.length}
            >
              <FileText size={16} />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              loading={exportLoading === 'excel'}
              disabled={!report?.trips?.length}
            >
              <FileSpreadsheet size={16} />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              loading={exportLoading === 'csv'}
              disabled={!report?.trips?.length}
            >
              <FileDown size={16} />
              CSV
            </Button>
          </div>
        }
      />
      <div className="p-4 lg:p-6 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
          <Select
            label="Rok"
            value={year}
            onChange={e => setYear(e.target.value)}
            options={YEARS}
          />
          <Select
            label="Miesiąc"
            value={month}
            onChange={e => setMonth(e.target.value)}
            options={MONTHS}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : !report ? null : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Przejazdy"
                value={report.trip_count}
                icon={<BarChart3 size={20} />}
                color="blue"
                subtitle={`${getMonthName(parseInt(month))} ${year}`}
              />
              <StatCard
                title="Łącznie km"
                value={formatKm(report.total_km)}
                icon={<Route size={20} />}
                color="green"
              />
              <StatCard
                title="Zużyte paliwo"
                value={formatLiters(report.total_fuel)}
                icon={<Fuel size={20} />}
                color="yellow"
              />
              <StatCard
                title="Śr. spalanie"
                value={formatConsumption(report.avg_consumption)}
                icon={<Fuel size={20} />}
                color="purple"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{report.hotel_count}</p>
                <p className="text-xs text-gray-500 mt-1">Z hotelem</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{report.night_count}</p>
                <p className="text-xs text-gray-500 mt-1">Noclegi</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{report.invoice_count}</p>
                <p className="text-xs text-gray-500 mt-1">Faktury</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{(report.errors ?? []).length}</p>
                <p className="text-xs text-gray-500 mt-1">Błędy</p>
              </div>
            </div>

            {(report.errors ?? []).length > 0 && (
              <Alert variant="warning" title={`${(report.errors ?? []).length} przejazdów z błędami`}>
                Przed eksportem raportu zalecamy poprawić błędy w ewidencji.
              </Alert>
            )}

            {/* Trip table */}
            {(report.trips?.length ?? 0) > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-gray-900">
                    Przejazdy — {getMonthName(parseInt(month))} {year}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Data</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Klient</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Km</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Paliwo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Hotel</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Faktura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(report.trips ?? []).map((trip) => (
                        <tr key={trip.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{formatDate(trip.date_from)}</td>
                          <td className="px-4 py-3 text-gray-700">{trip.client?.name ?? '-'}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {trip.distance_km != null ? `${trip.distance_km} km` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {trip.fuel_used != null ? `${trip.fuel_used} L` : '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {trip.hotel ? `${trip.hotel_days ?? 1} noc` : '-'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                            {trip.invoice_number ?? '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(report.trips?.length ?? 0) === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                Brak przejazdów w wybranym okresie
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
