'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import type { Vehicle } from '@/lib/types'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const emptyForm = {
  brand: '',
  model: '',
  registration_number: '',
  year: '',
  fuel_norm: '',
  tank_capacity: '',
  starting_mileage: '',
  starting_fuel: '',
  is_active: true
}

export default function PojazdyPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formLoading, setFormLoading] = useState(false)

  const fetchVehicles = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vehicles')
      const { data } = await res.json()
      setVehicles(data ?? [])
    } catch {
      toast.error('Błąd pobierania pojazdów')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchVehicles() }, [])

  const openAdd = () => {
    setEditVehicle(null)
    setFormData(emptyForm)
    setShowForm(true)
  }

  const openEdit = (v: Vehicle) => {
    setEditVehicle(v)
    setFormData({
      brand: v.brand,
      model: v.model,
      registration_number: v.registration_number,
      year: v.year != null ? String(v.year) : '',
      fuel_norm: v.fuel_norm != null ? String(v.fuel_norm) : '',
      tank_capacity: v.tank_capacity != null ? String(v.tank_capacity) : '',
      starting_mileage: v.starting_mileage != null ? String(v.starting_mileage) : '',
      starting_fuel: v.starting_fuel != null ? String(v.starting_fuel) : '',
      is_active: v.is_active
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.brand || !formData.model || !formData.registration_number) {
      toast.error('Wypełnij wymagane pola')
      return
    }
    setFormLoading(true)
    try {
      const payload = {
        ...formData,
        year: formData.year ? parseInt(formData.year) : null,
        fuel_norm: formData.fuel_norm ? parseFloat(formData.fuel_norm) : null,
        tank_capacity: formData.tank_capacity ? parseFloat(formData.tank_capacity) : null,
        starting_mileage: formData.starting_mileage ? parseFloat(formData.starting_mileage) : null,
        starting_fuel: formData.starting_fuel ? parseFloat(formData.starting_fuel) : null
      }

      const url = editVehicle ? `/api/vehicles/${editVehicle.id}` : '/api/vehicles'
      const method = editVehicle ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editVehicle ? 'Pojazd zaktualizowany' : 'Pojazd dodany')
      setShowForm(false)
      fetchVehicles()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await fetch(`/api/vehicles/${deleteId}`, { method: 'DELETE' })
      toast.success('Pojazd dezaktywowany')
      setDeleteId(null)
      fetchVehicles()
    } catch {
      toast.error('Błąd')
    }
  }

  return (
    <div>
      <Header
        title="Pojazdy"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus size={16} />
            Dodaj pojazd
          </Button>
        }
      />
      <div className="p-4 lg:p-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pojazd</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nr rej.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rok</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Norma</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Zbiornik</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10"><Spinner /></td></tr>
              ) : vehicles.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Brak pojazdów</td></tr>
              ) : (
                vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{v.brand} {v.model}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">{v.registration_number}</td>
                    <td className="px-4 py-3 text-gray-600">{v.year ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {v.fuel_norm != null ? `${v.fuel_norm} L/100km` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {v.tank_capacity != null ? `${v.tank_capacity} L` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={v.is_active ? 'success' : 'default'}>
                        {v.is_active ? 'Aktywny' : 'Nieaktywny'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setDeleteId(v.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
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
        title={editVehicle ? 'Edytuj pojazd' : 'Dodaj pojazd'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anuluj</Button>
            <Button onClick={handleSave} loading={formLoading}>Zapisz</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Marka *" value={formData.brand} onChange={e => setFormData(f => ({ ...f, brand: e.target.value }))} placeholder="np. Škoda" />
          <Input label="Model *" value={formData.model} onChange={e => setFormData(f => ({ ...f, model: e.target.value }))} placeholder="np. Octavia" />
          <Input label="Nr rejestracyjny *" value={formData.registration_number} onChange={e => setFormData(f => ({ ...f, registration_number: e.target.value }))} placeholder="np. WA 12345" />
          <Input label="Rok produkcji" type="number" value={formData.year} onChange={e => setFormData(f => ({ ...f, year: e.target.value }))} placeholder="np. 2022" />
          <Input label="Norma spalania (L/100km)" type="number" step="0.1" value={formData.fuel_norm} onChange={e => setFormData(f => ({ ...f, fuel_norm: e.target.value }))} placeholder="np. 6.5" />
          <Input label="Pojemność zbiornika (L)" type="number" value={formData.tank_capacity} onChange={e => setFormData(f => ({ ...f, tank_capacity: e.target.value }))} placeholder="np. 55" />
          <Input label="Stan licznika startowy" type="number" value={formData.starting_mileage} onChange={e => setFormData(f => ({ ...f, starting_mileage: e.target.value }))} placeholder="np. 0" />
          <Input label="Paliwo startowe (L)" type="number" value={formData.starting_fuel} onChange={e => setFormData(f => ({ ...f, starting_fuel: e.target.value }))} placeholder="np. 0" />
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formData.is_active} onChange={e => setFormData(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
              <span>Pojazd aktywny</span>
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Dezaktywuj pojazd"
        message="Czy na pewno chcesz dezaktywować ten pojazd?"
        confirmLabel="Dezaktywuj"
      />
    </div>
  )
}
