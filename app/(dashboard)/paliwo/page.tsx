'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Spinner } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Alert'
import { StatCard } from '@/components/ui/Card'
import { formatDate, formatLiters, formatCurrency, todayAsInputValue } from '@/lib/utils/formatting'
import type { FuelPurchase, Vehicle } from '@/lib/types'
import { Plus, Edit2, Trash2, Fuel, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const emptyForm = {
  trip_id: '',
  vehicle_id: '',
  date: todayAsInputValue(),
  liters: '',
  amount_gross: '',
  invoice_number: '',
  notes: ''
}

export default function PaliwoPage() {
  const [fuels, setFuels] = useState<FuelPurchase[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<FuelPurchase | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formLoading, setFormLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [fuelRes, vehicleRes] = await Promise.all([
        fetch('/api/fuel'),
        fetch('/api/vehicles')
      ])
      const { data: fuelData } = await fuelRes.json()
      const { data: vehicleData } = await vehicleRes.json()
      setFuels(fuelData ?? [])
      setVehicles(vehicleData ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const openAdd = () => {
    setEditItem(null)
    setFormData(emptyForm)
    setShowForm(true)
  }

  const openEdit = (f: FuelPurchase) => {
    setEditItem(f)
    setFormData({
      trip_id: f.trip_id ?? '',
      vehicle_id: f.vehicle_id ?? '',
      date: f.date,
      liters: f.liters != null ? String(f.liters) : '',
      amount_gross: f.amount_gross != null ? String(f.amount_gross) : '',
      invoice_number: f.invoice_number ?? '',
      notes: f.notes ?? ''
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.vehicle_id || !formData.liters || !formData.date) {
      toast.error('Wypełnij wymagane pola')
      return
    }
    setFormLoading(true)
    try {
      const payload = {
        ...formData,
        liters: parseFloat(formData.liters),
        amount_gross: formData.amount_gross ? parseFloat(formData.amount_gross) : null,
        trip_id: formData.trip_id || null,
        invoice_number: formData.invoice_number || null,
        notes: formData.notes || null
      }
      const url = editItem ? `/api/fuel/${editItem.id}` : '/api/fuel'
      const method = editItem ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editItem ? 'Faktura zaktualizowana' : 'Faktura dodana')
      setShowForm(false)
      fetchData()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await fetch(`/api/fuel/${deleteId}`, { method: 'DELETE' })
      toast.success('Faktura usunięta')
      setDeleteId(null)
      fetchData()
    } catch {
      toast.error('Błąd')
    }
  }

  const totalLiters = fuels.reduce((s, f) => s + (f.liters ?? 0), 0)
  const totalAmount = fuels.reduce((s, f) => s + (f.amount_gross ?? 0), 0)
  const withoutTrip = fuels.filter((f) => !f.trip_id).length

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${v.brand} ${v.model} (${v.registration_number})`
  }))

  return (
    <div>
      <Header
        title="Paliwo i faktury"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus size={16} />
            Dodaj fakturę
          </Button>
        }
      />
      <div className="p-4 lg:p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard title="Faktury" value={fuels.length} icon={<Fuel size={20} />} color="yellow" />
          <StatCard title="Łącznie litrów" value={`${totalLiters.toFixed(2)} L`} icon={<Fuel size={20} />} color="blue" />
          <StatCard title="Łączna kwota" value={formatCurrency(totalAmount)} icon={<Fuel size={20} />} color="green" />
        </div>

        {withoutTrip > 0 && (
          <Alert variant="warning" title="Faktury bez powiązanego przejazdu">
            {withoutTrip} faktur nie ma przypisanego przejazdu.
          </Alert>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nr faktury</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">POP</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Litry</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10"><Spinner /></td></tr>
              ) : fuels.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">Brak faktur</td></tr>
              ) : (
                fuels.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{formatDate(f.date)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs font-mono">{f.invoice_number ?? <span className="text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> Brak</span>}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-700">
                      {(f.trip as any)?.card_number ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{f.liters != null ? `${f.liters} L` : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setDeleteId(f.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? 'Edytuj fakturę' : 'Dodaj fakturę paliwową'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anuluj</Button>
            <Button onClick={handleSave} loading={formLoading}>Zapisz</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Pojazd *"
            value={formData.vehicle_id}
            onChange={e => setFormData(f => ({ ...f, vehicle_id: e.target.value }))}
            options={vehicleOptions}
            placeholder="Wybierz pojazd..."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data *" type="date" value={formData.date} onChange={e => setFormData(f => ({ ...f, date: e.target.value }))} />
            <Input label="Nr faktury" value={formData.invoice_number} onChange={e => setFormData(f => ({ ...f, invoice_number: e.target.value }))} placeholder="FV/2025/001" />
            <Input label="Ilość litrów *" type="number" step="0.01" value={formData.liters} onChange={e => setFormData(f => ({ ...f, liters: e.target.value }))} />
            <Input label="Kwota brutto (PLN)" type="number" step="0.01" value={formData.amount_gross} onChange={e => setFormData(f => ({ ...f, amount_gross: e.target.value }))} />
          </div>
          <Textarea label="Uwagi" value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Usuń fakturę"
        message="Czy na pewno chcesz usunąć tę fakturę?"
        confirmLabel="Usuń"
      />
    </div>
  )
}
