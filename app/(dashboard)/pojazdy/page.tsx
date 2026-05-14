'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import type { Vehicle } from '@/lib/types'
import { Plus, Edit2, Trash2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const vehicleSchema = z.object({
  brand: z.string().min(1, 'Marka jest wymagana'),
  model: z.string().min(1, 'Model jest wymagany'),
  registration_number: z.string().min(1, 'Nr rejestracyjny jest wymagany'),
  year: z.string().optional(),
  fuel_norm: z.string().optional(),
  tank_capacity: z.string().optional(),
  starting_mileage: z.string().optional(),
  starting_fuel: z.string().optional(),
  is_active: z.boolean(),
})
type VehicleForm = z.infer<typeof vehicleSchema>

const emptyForm: VehicleForm = {
  brand: '', model: '', registration_number: '', year: '', fuel_norm: '',
  tank_capacity: '', starting_mileage: '', starting_fuel: '', is_active: true,
}

export default function PojazdyPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [hardDeleteId, setHardDeleteId] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<VehicleForm>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: emptyForm,
  })

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const res = await fetch('/api/vehicles')
      const { data } = await res.json()
      return data ?? []
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (form: VehicleForm) => {
      const payload = {
        ...form,
        year: form.year ? parseInt(form.year) : null,
        fuel_norm: form.fuel_norm ? parseFloat(form.fuel_norm) : null,
        tank_capacity: form.tank_capacity ? parseFloat(form.tank_capacity) : null,
        starting_mileage: form.starting_mileage ? parseFloat(form.starting_mileage) : null,
        starting_fuel: form.starting_fuel ? parseFloat(form.starting_fuel) : null,
      }
      const url = editVehicle ? `/api/vehicles/${editVehicle.id}` : '/api/vehicles'
      const method = editVehicle ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      toast.success(editVehicle ? 'Pojazd zaktualizowany' : 'Pojazd dodany')
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Błąd zapisu'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/vehicles/${id}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error() }),
    onSuccess: () => {
      toast.success('Pojazd dezaktywowany')
      setDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
    onError: () => toast.error('Błąd'),
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/vehicles/${id}?force=true`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error() }),
    onSuccess: () => {
      toast.success('Pojazd usunięty')
      setHardDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
    onError: () => toast.error('Błąd usuwania pojazdu'),
  })

  const openAdd = () => {
    setEditVehicle(null)
    reset(emptyForm)
    setShowForm(true)
  }

  const openEdit = (v: Vehicle) => {
    setEditVehicle(v)
    reset({
      brand: v.brand,
      model: v.model,
      registration_number: v.registration_number,
      year: v.year != null ? String(v.year) : '',
      fuel_norm: v.fuel_norm != null ? String(v.fuel_norm) : '',
      tank_capacity: v.tank_capacity != null ? String(v.tank_capacity) : '',
      starting_mileage: v.starting_mileage != null ? String(v.starting_mileage) : '',
      starting_fuel: v.starting_fuel != null ? String(v.starting_fuel) : '',
      is_active: v.is_active,
    })
    setShowForm(true)
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
              {isLoading ? (
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
                        <button onClick={() => setDeleteId(v.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Dezaktywuj">
                          <Trash2 size={15} />
                        </button>
                        <button onClick={() => setHardDeleteId(v.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-700 hover:bg-red-100" title="Usuń trwale">
                          <XCircle size={15} />
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
            <Button onClick={handleSubmit((data) => saveMutation.mutate(data))} loading={saveMutation.isPending}>Zapisz</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Marka *" {...register('brand')} error={errors.brand?.message} placeholder="np. Škoda" />
          <Input label="Model *" {...register('model')} error={errors.model?.message} placeholder="np. Octavia" />
          <Input label="Nr rejestracyjny *" {...register('registration_number')} error={errors.registration_number?.message} placeholder="np. WA 12345" />
          <Input label="Rok produkcji" type="number" {...register('year')} error={errors.year?.message} placeholder="np. 2022" />
          <Input label="Norma spalania (L/100km)" type="number" step="0.1" {...register('fuel_norm')} error={errors.fuel_norm?.message} placeholder="np. 6.5" />
          <Input label="Pojemność zbiornika (L)" type="number" {...register('tank_capacity')} error={errors.tank_capacity?.message} placeholder="np. 55" />
          <Input label="Stan licznika startowy" type="number" {...register('starting_mileage')} error={errors.starting_mileage?.message} placeholder="np. 0" />
          <Input label="Paliwo startowe (L)" type="number" {...register('starting_fuel')} error={errors.starting_fuel?.message} placeholder="np. 0" />
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('is_active')} className="rounded" />
              <span>Pojazd aktywny</span>
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Dezaktywuj pojazd"
        message="Czy na pewno chcesz dezaktywować ten pojazd?"
        confirmLabel="Dezaktywuj"
      />
      <ConfirmModal
        open={!!hardDeleteId}
        onClose={() => setHardDeleteId(null)}
        onConfirm={() => hardDeleteId && hardDeleteMutation.mutate(hardDeleteId)}
        title="Usuń pojazd trwale"
        message="Uwaga! Pojazd zostanie trwale usunięty z bazy danych. Tej operacji nie można cofnąć."
        confirmLabel="Usuń trwale"
        variant="danger"
      />    </div>
  )
}
