import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatKm } from '@/lib/utils/formatting'
import Link from 'next/link'
import { MapPin, Route, Calendar, FileText, Hotel } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function KlientDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: trips }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase
      .from('trips')
      .select('*, vehicle:vehicles(brand,model,registration_number)')
      .eq('client_id', id)
      .order('date_from', { ascending: false })
  ])

  if (!client) return notFound()

  const totalKm = (trips ?? []).reduce((s, t) => s + (t.distance_km ?? 0), 0)
  const withHotel = (trips ?? []).filter((t) => t.hotel).length
  const withInvoice = (trips ?? []).filter((t) => t.invoice_number).length
  const lastTrip = trips?.[0]

  return (
    <div>
      <Header title={client.name} />
      <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Client info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {client.code && (
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {client.code}
                  </span>
                )}
                <Badge variant={client.is_active ? 'success' : 'default'}>
                  {client.is_active ? 'Aktywny' : 'Nieaktywny'}
                </Badge>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{client.name}</h2>
              {client.city && (
                <p className="text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin size={14} />
                  {client.city}
                </p>
              )}
              {client.distance_km && (
                <p className="text-gray-500 flex items-center gap-1 text-sm mt-1">
                  <Route size={14} />
                  Standardowa trasa: {client.distance_km} km
                </p>
              )}
            </div>
            <Link href={`/klienci`}>
              <button className="text-sm text-primary-600 hover:underline">← Wróć</button>
            </Link>
          </div>
          {client.notes && (
            <p className="mt-4 text-sm text-gray-600 border-t border-gray-100 pt-4">{client.notes}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-primary-600">{(trips ?? []).length}</p>
            <p className="text-xs text-gray-500 mt-1">Wizyty</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatKm(totalKm)}</p>
            <p className="text-xs text-gray-500 mt-1">Łącznie km</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{withHotel}</p>
            <p className="text-xs text-gray-500 mt-1">Z hotelem</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{withInvoice}</p>
            <p className="text-xs text-gray-500 mt-1">Faktury</p>
          </div>
        </div>

        {/* Trip history */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Historia przejazdów</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pojazd</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Km</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Faktura</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Hotel</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(trips ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      Brak przejazdów
                    </td>
                  </tr>
                ) : (
                  (trips ?? []).map((trip) => (
                    <tr key={trip.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        {formatDate(trip.date_from)}
                        {trip.date_to !== trip.date_from && ` – ${formatDate(trip.date_to)}`}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {trip.vehicle
                          ? `${trip.vehicle.brand} ${trip.vehicle.model} (${trip.vehicle.registration_number})`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {trip.distance_km != null ? `${trip.distance_km} km` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{trip.invoice_number ?? '-'}</td>
                      <td className="px-4 py-3">
                        {trip.hotel && <Badge variant="purple">Hotel</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/przejazdy/${trip.id}/edytuj`}>
                          <button className="text-xs text-primary-600 hover:underline">Edytuj</button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
