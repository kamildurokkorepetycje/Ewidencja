'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import type { Driver } from '@/lib/types'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', is_active: true }

export default function KierowcyPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editDriver, setEditDriver] = useState<Driver | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formLoading, setFormLoading] = useState(false)

  const fetchDrivers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/drivers')
      const { data } = await res.json()
      setDrivers(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDrivers() }, [])

  const openAdd = () => {
    setEditDriver(null)
    setFormData(emptyForm)
    setShowForm(true)
  }

  const openEdit = (d: Driver) => {
    setEditDriver(d)
    setFormData({
      first_name: d.first_name,
      last_name: d.last_name,
      email: d.email ?? '',
      phone: d.phone ?? '',
      is_active: d.is_active
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name) {
      toast.error('Imię i nazwisko są wymagane')
      return
    }
    setFormLoading(true)
    try {
      const payload = {
        ...formData,
        email: formData.email || null,
        phone: formData.phone || null
      }
      const url = editDriver ? `/api/drivers/${editDriver.id}` : '/api/drivers'
      const method = editDriver ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editDriver ? 'Kierowca zaktualizowany' : 'Kierowca dodany')
      setShowForm(false)
      fetchDrivers()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await fetch(`/api/drivers/${deleteId}`, { method: 'DELETE' })
      toast.success('Kierowca dezaktywowany')
      setDeleteId(null)
      fetchDrivers()
    } catch {
      toast.error('Błąd')
    }
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
              {loading ? (
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
                        <button onClick={() => setDeleteId(d.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
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
        title={editDriver ? 'Edytuj kierowcę' : 'Dodaj kierowcę'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anuluj</Button>
            <Button onClick={handleSave} loading={formLoading}>Zapisz</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Imię *" value={formData.first_name} onChange={e => setFormData(f => ({ ...f, first_name: e.target.value }))} />
          <Input label="Nazwisko *" value={formData.last_name} onChange={e => setFormData(f => ({ ...f, last_name: e.target.value }))} />
          <Input label="Email" type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} />
          <Input label="Telefon" value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} />
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formData.is_active} onChange={e => setFormData(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
              <span>Kierowca aktywny</span>
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Dezaktywuj kierowcę"
        message="Czy na pewno chcesz dezaktywować tego kierowcę?"
        confirmLabel="Dezaktywuj"
      />
    </div>
  )
}
