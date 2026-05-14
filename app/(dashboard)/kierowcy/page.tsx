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
import type { Driver } from '@/lib/types'
import { Plus, Edit2, Trash2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const driverSchema = z.object({
  first_name: z.string().min(1, 'Imię jest wymagane'),
  last_name: z.string().min(1, 'Nazwisko jest wymagane'),
  email: z.union([z.string().email('Nieprawidłowy email'), z.literal('')]).optional(),
  phone: z.string().optional(),
  is_active: z.boolean(),
})
type DriverForm = z.infer<typeof driverSchema>

const emptyForm: DriverForm = { first_name: '', last_name: '', email: '', phone: '', is_active: true }

export default function KierowcyPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editDriver, setEditDriver] = useState<Driver | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [hardDeleteId, setHardDeleteId] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<DriverForm>({
    resolver: zodResolver(driverSchema),
    defaultValues: emptyForm,
  })

  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: async () => {
      const res = await fetch('/api/drivers')
      const { data } = await res.json()
      return data ?? []
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (form: DriverForm) => {
      const payload = { ...form, email: form.email || null, phone: form.phone || null }
      const url = editDriver ? `/api/drivers/${editDriver.id}` : '/api/drivers'
      const method = editDriver ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      toast.success(editDriver ? 'Kierowca zaktualizowany' : 'Kierowca dodany')
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Błąd zapisu'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/drivers/${id}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error() }),
    onSuccess: () => {
      toast.success('Kierowca dezaktywowany')
      setDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
    },
    onError: () => toast.error('Błąd'),
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/drivers/${id}?force=true`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error() }),
    onSuccess: () => {
      toast.success('Kierowca usunięty')
      setHardDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
    },
    onError: () => toast.error('Błąd usuwania kierowcy'),
  })

  const openAdd = () => {
    setEditDriver(null)
    reset(emptyForm)
    setShowForm(true)
  }

  const openEdit = (d: Driver) => {
    setEditDriver(d)
    reset({
      first_name: d.first_name,
      last_name: d.last_name,
      email: d.email ?? '',
      phone: d.phone ?? '',
      is_active: d.is_active,
    })
    setShowForm(true)
  }
  return (
    <div>
      <Header
        title="Kierowcy"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus size={16} />
            Dodaj kierowcę
          </Button>
        }
      />
      <div className="p-4 lg:p-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Imię i nazwisko</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Telefon</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-10"><Spinner /></td></tr>
              ) : drivers.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">Brak kierowców</td></tr>
              ) : (
                drivers.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{d.first_name} {d.last_name}</td>
                    <td className="px-4 py-3 text-gray-600">{d.email ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{d.phone ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={d.is_active ? 'success' : 'default'}>
                        {d.is_active ? 'Aktywny' : 'Nieaktywny'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setDeleteId(d.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Dezaktywuj">
                          <Trash2 size={15} />
                        </button>
                        <button onClick={() => setHardDeleteId(d.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-700 hover:bg-red-100" title="Usuń trwale">
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
        title={editDriver ? 'Edytuj kierowcę' : 'Dodaj kierowcę'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anuluj</Button>
            <Button onClick={handleSubmit((data) => saveMutation.mutate(data))} loading={saveMutation.isPending}>Zapisz</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Imię *" {...register('first_name')} error={errors.first_name?.message} />
          <Input label="Nazwisko *" {...register('last_name')} error={errors.last_name?.message} />
          <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
          <Input label="Telefon" {...register('phone')} error={errors.phone?.message} />
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('is_active')} className="rounded" />
              <span>Kierowca aktywny</span>
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Dezaktywuj kierowcę"
        message="Czy na pewno chcesz dezaktywować tego kierowcę?"
        confirmLabel="Dezaktywuj"
      />
      <ConfirmModal
        open={!!hardDeleteId}
        onClose={() => setHardDeleteId(null)}
        onConfirm={() => hardDeleteId && hardDeleteMutation.mutate(hardDeleteId)}
        title="Usuń kierowcę trwale"
        message="Uwaga! Kierowca zostanie trwale usunięty z bazy danych. Tej operacji nie można cofnąć."
        confirmLabel="Usuń trwale"
        variant="danger"
      />    </div>
  )
}
