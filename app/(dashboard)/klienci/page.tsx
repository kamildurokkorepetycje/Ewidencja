'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/ui/SearchInput'
import { ConfirmModal, Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Spinner } from '@/components/ui/Spinner'
import type { Client } from '@/lib/types'
import { Plus, Edit2, Trash2, Eye, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const clientSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, 'Nazwa klienta jest wymagana'),
  city: z.string().optional(),
  distance_km: z
    .string()
    .optional()
    .refine((v) => !v || !isNaN(parseFloat(v)), { message: 'Musi być liczbą' }),
  notes: z.string().optional(),
  is_active: z.boolean(),
})
type ClientForm = z.infer<typeof clientSchema>

const defaultValues: ClientForm = {
  code: '',
  name: '',
  city: '',
  distance_km: '',
  notes: '',
  is_active: true,
}

export default function KlienciPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [hardDeleteId, setHardDeleteId] = useState<string | null>(null)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues,
  })

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: async () => {
      const res = await fetch('/api/clients')
      const { data } = await res.json()
      return data ?? []
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (form: ClientForm) => {
      const payload = {
        ...form,
        distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
        code: form.code || null,
        city: form.city || null,
        notes: form.notes || null,
      }
      const url = editClient ? `/api/clients/${editClient.id}` : '/api/clients'
      const method = editClient ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      toast.success(editClient ? 'Klient zaktualizowany' : 'Klient dodany')
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Błąd zapisu'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/clients/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error()
      }),
    onSuccess: () => {
      toast.success('Klient dezaktywowany')
      setDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: () => toast.error('Błąd usuwania klienta'),
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/clients/${id}?force=true`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error()
      }),
    onSuccess: () => {
      toast.success('Klient usunięty')
      setHardDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: () => toast.error('Błąd usuwania klienta'),
  })

  const openAdd = () => {
    setEditClient(null)
    reset(defaultValues)
    setShowForm(true)
  }

  const openEdit = (client: Client) => {
    setEditClient(client)
    reset({
      code: client.code ?? '',
      name: client.name,
      city: client.city ?? '',
      distance_km: client.distance_km != null ? String(client.distance_km) : '',
      notes: client.notes ?? '',
      is_active: client.is_active,
    })
    setShowForm(true)
  }

  const filtered = clients.filter((c) => {
    if (!showInactive && !c.is_active) return false
    if (!search) return true
    return (
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code?.toLowerCase().includes(search.toLowerCase()) ||
      c.city?.toLowerCase().includes(search.toLowerCase())
    )
  })

  return (
    <div>
      <Header
        title="Klienci"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus size={16} />
            Dodaj klienta
          </Button>
        }
      />

      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex gap-3 items-center flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Szukaj klienta..."
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Pokaż nieaktywnych
          </label>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Kod</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nazwa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Miejscowość</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Odległość</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    <Spinner />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-400">
                    Brak klientów
                  </td>
                </tr>
              ) : (
                filtered.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{client.code ?? '-'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{client.name}</td>
                    <td className="px-4 py-3 text-gray-600">{client.city ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {client.distance_km != null ? `${client.distance_km} km` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={client.is_active ? 'success' : 'default'}>
                        {client.is_active ? 'Aktywny' : 'Nieaktywny'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/klienci/${client.id}`}>
                          <button className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                            <Eye size={15} />
                          </button>
                        </Link>
                        <button
                          onClick={() => openEdit(client)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteId(client.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Dezaktywuj"
                        >
                          <Trash2 size={15} />
                        </button>
                        <button
                          onClick={() => setHardDeleteId(client.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-700 hover:bg-red-100 transition-colors"
                          title="Usuń trwale"
                        >
                          <XCircle size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-gray-100 text-sm text-gray-400">
            {filtered.length} klientów
          </div>
        </div>
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editClient ? 'Edytuj klienta' : 'Dodaj klienta'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anuluj</Button>
            <Button
              onClick={handleSubmit((data) => saveMutation.mutate(data))}
              loading={saveMutation.isPending}
            >
              Zapisz
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Kod klienta"
              placeholder="np. KL-001"
              {...register('code')}
              error={errors.code?.message}
            />
            <Input
              label="Nazwa klienta *"
              placeholder="Nazwa firmy lub osoby"
              {...register('name')}
              error={errors.name?.message}
            />
            <Input
              label="Miejscowość"
              placeholder="np. Warszawa"
              {...register('city')}
              error={errors.city?.message}
            />
            <Input
              label="Standardowa odległość (km)"
              type="number"
              placeholder="np. 150"
              {...register('distance_km')}
              error={errors.distance_km?.message}
            />
          </div>
          <Textarea
            label="Uwagi"
            {...register('notes')}
            error={errors.notes?.message}
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('is_active')} className="rounded" />
            <span>Aktywny</span>
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Dezaktywuj klienta"
        message="Czy na pewno chcesz dezaktywować tego klienta? Dane przejazdów zostaną zachowane."
        confirmLabel="Dezaktywuj"
      />
      <ConfirmModal
        open={!!hardDeleteId}
        onClose={() => setHardDeleteId(null)}
        onConfirm={() => hardDeleteId && hardDeleteMutation.mutate(hardDeleteId)}
        title="Usuń klienta trwale"
        message="Uwaga! Klient zostanie trwale usunięty z bazy danych. Tej operacji nie można cofnąć."
        confirmLabel="Usuń trwale"
        variant="danger"
      />    </div>
  )
}
