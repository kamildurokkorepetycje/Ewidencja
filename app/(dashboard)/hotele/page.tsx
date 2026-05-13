'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import type { HotelLocation, HotelClientDistance, Client } from '@/lib/types'
import { Plus, Edit2, Trash2, Hotel, Users } from 'lucide-react'
import toast from 'react-hot-toast'

export default function HotelePage() {
  const [hotels, setHotels] = useState<HotelLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editHotel, setEditHotel] = useState<HotelLocation | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    notes: '',
    is_active: true,
  })

  // --- clients modal state ---
  const [clientsHotel, setClientsHotel] = useState<HotelLocation | null>(null)
  const [hotelClients, setHotelClients] = useState<HotelClientDistance[]>([])
  const [allClients, setAllClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [newClientId, setNewClientId] = useState('')
  const [newClientKm, setNewClientKm] = useState('')
  const [addingClient, setAddingClient] = useState(false)
  const [editingEntry, setEditingEntry] = useState<{ id: string; km: string } | null>(null)
  const [savingEntry, setSavingEntry] = useState(false)
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null)

  const fetchHotels = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/hotels')
      const { data } = await res.json()
      setHotels(data ?? [])
    } catch {
      toast.error('Błąd pobierania hoteli')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHotels()
  }, [])

  const fetchHotelClients = useCallback(async (hotelId: string) => {
    setClientsLoading(true)
    try {
      const res = await fetch(`/api/hotels/${hotelId}/clients`)
      const { data } = await res.json()
      setHotelClients(data ?? [])
    } catch {
      toast.error('Błąd pobierania klientów hotelu')
    } finally {
      setClientsLoading(false)
    }
  }, [])

  const fetchAllClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients?is_active=true')
      const { data } = await res.json()
      setAllClients(data ?? [])
    } catch {
      toast.error('Błąd pobierania klientów')
    }
  }, [])

  const openClientsModal = async (hotel: HotelLocation) => {
    setClientsHotel(hotel)
    setNewClientId('')
    setNewClientKm('')
    setEditingEntry(null)
    await Promise.all([fetchHotelClients(hotel.id), fetchAllClients()])
  }

  const closeClientsModal = () => {
    setClientsHotel(null)
    setHotelClients([])
    setEditingEntry(null)
  }

  const handleAddClient = async () => {
    if (!clientsHotel || !newClientId) {
      toast.error('Wybierz klienta')
      return
    }
    setAddingClient(true)
    try {
      const res = await fetch(`/api/hotels/${clientsHotel.id}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: newClientId,
          distance_km: newClientKm ? parseFloat(newClientKm) : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Błąd zapisu')
      }
      toast.success('Klient dodany')
      setNewClientId('')
      setNewClientKm('')
      await fetchHotelClients(clientsHotel.id)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
    } finally {
      setAddingClient(false)
    }
  }

  const handleSaveKm = async (entryId: string) => {
    if (!clientsHotel || !editingEntry) return
    setSavingEntry(true)
    try {
      const res = await fetch(`/api/hotels/${clientsHotel.id}/clients/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_km: editingEntry.km ? parseFloat(editingEntry.km) : null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Kilometry zaktualizowane')
      setEditingEntry(null)
      await fetchHotelClients(clientsHotel.id)
    } catch {
      toast.error('Błąd zapisu')
    } finally {
      setSavingEntry(false)
    }
  }

  const handleDeleteEntry = async () => {
    if (!clientsHotel || !deleteEntryId) return
    try {
      const res = await fetch(`/api/hotels/${clientsHotel.id}/clients/${deleteEntryId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Klient usunięty')
      setDeleteEntryId(null)
      await fetchHotelClients(clientsHotel.id)
    } catch {
      toast.error('Błąd usuwania')
    }
  }

  const openAdd = () => {
    setEditHotel(null)
    setFormData({ name: '', city: '', notes: '', is_active: true })
    setShowForm(true)
  }

  const openEdit = (hotel: HotelLocation) => {
    setEditHotel(hotel)
    setFormData({
      name: hotel.name,
      city: hotel.city ?? '',
      notes: hotel.notes ?? '',
      is_active: hotel.is_active,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nazwa hotelu jest wymagana')
      return
    }
    setFormLoading(true)
    try {
      const payload = {
        name: formData.name.trim(),
        city: formData.city.trim() || null,
        notes: formData.notes.trim() || null,
        is_active: formData.is_active,
      }
      const url = editHotel ? `/api/hotels/${editHotel.id}` : '/api/hotels'
      const method = editHotel ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Blad zapisu')
      }
      toast.success(editHotel ? 'Hotel zaktualizowany' : 'Hotel dodany')
      setShowForm(false)
      fetchHotels()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/hotels/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Hotel dezaktywowany')
      setDeleteId(null)
      fetchHotels()
    } catch {
      toast.error('Błąd usuwania hotelu')
    }
  }

  const filtered = hotels.filter((h) => {
    if (!showInactive && !h.is_active) return false
    if (!search) return true
    return (
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.city?.toLowerCase().includes(search.toLowerCase())
    )
  })

  return (
    <div>
      <Header
        title="Hotele"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus size={16} />
            Dodaj hotel
          </Button>
        }
      />
      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex gap-3 items-center flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Szukaj hotelu..."
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Pokaż nieaktywne
          </label>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Nazwa
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Miejscowość
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-10">
                    <Spinner />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-400">
                    {hotels.length === 0 ? 'Brak hoteli - dodaj pierwszy' : 'Brak wyników'}
                  </td>
                </tr>
              ) : (
                filtered.map((hotel) => (
                  <tr key={hotel.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <span className="flex items-center gap-2">
                        <Hotel size={14} className="text-purple-400" />
                        {hotel.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{hotel.city ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={hotel.is_active ? 'success' : 'default'}>
                        {hotel.is_active ? 'Aktywny' : 'Nieaktywny'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openClientsModal(hotel)}
                          className="p-1.5 rounded hover:bg-purple-50 text-gray-400 hover:text-purple-600"
                          title="Klienci i kilometry"
                        >
                          <Users size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(hotel)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          title="Edytuj"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteId(hotel.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                          title="Dezaktywuj"
                        >
                          <Trash2 size={14} />
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
        title={editHotel ? 'Edytuj hotel' : 'Dodaj hotel'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} loading={formLoading}>
              {editHotel ? 'Zapisz zmiany' : 'Dodaj hotel'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nazwa hotelu *"
            value={formData.name}
            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            placeholder="np. Hotel Novotel Kraków"
          />
          <Input
            label="Miejscowość"
            value={formData.city}
            onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
            placeholder="np. Kraków"
          />
          <Textarea
            label="Uwagi"
            value={formData.notes}
            onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Dodatkowe informacje..."
          />
          {editHotel && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                className="rounded"
              />
              Aktywny
            </label>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Dezaktywuj hotel"
        message="Hotel zostanie ukryty z listy. Dane historyczne pozostaną."
        confirmLabel="Dezaktywuj"
        variant="danger"
      />

      {/* Clients modal */}
      <Modal
        open={!!clientsHotel}
        onClose={closeClientsModal}
        title={clientsHotel ? `Klienci — ${clientsHotel.name}` : ''}
        size="lg"
        footer={
          <Button variant="outline" onClick={closeClientsModal}>
            Zamknij
          </Button>
        }
      >
        <div className="space-y-5">
          {/* Add new client */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
            <p className="text-sm font-medium text-gray-700">Dodaj klienta</p>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Select
                  label="Klient"
                  value={newClientId}
                  onChange={(e) => setNewClientId(e.target.value)}
                  options={allClients
                    .filter((c) => !hotelClients.some((hc) => hc.client_id === c.id))
                    .map((c) => ({
                      value: c.id,
                      label: c.code ? `${c.code} – ${c.name}` : c.name,
                    }))}
                  placeholder="Wybierz klienta..."
                />
              </div>
              <div className="w-32">
                <Input
                  label="Kilometry"
                  type="number"
                  min="0"
                  step="0.1"
                  value={newClientKm}
                  onChange={(e) => setNewClientKm(e.target.value)}
                  placeholder="np. 45"
                />
              </div>
              <Button
                onClick={handleAddClient}
                loading={addingClient}
                disabled={!newClientId}
                size="sm"
                className="mb-0.5"
              >
                <Plus size={14} />
                Dodaj
              </Button>
            </div>
          </div>

          {/* Assigned clients list */}
          {clientsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : hotelClients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Brak przypisanych klientów
            </p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
              {hotelClients.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {entry.client?.code
                        ? `${entry.client.code} – ${entry.client.name}`
                        : entry.client?.name ?? '—'}
                    </p>
                    {entry.client?.city && (
                      <p className="text-xs text-gray-400">{entry.client.city}</p>
                    )}
                  </div>
                  {editingEntry?.id === entry.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={editingEntry.km}
                        onChange={(e) =>
                          setEditingEntry((prev) => prev ? { ...prev, km: e.target.value } : prev)
                        }
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
                        autoFocus
                      />
                      <span className="text-sm text-gray-500">km</span>
                      <Button size="sm" onClick={() => handleSaveKm(entry.id)} loading={savingEntry}>
                        Zapisz
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingEntry(null)}>
                        Anuluj
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span
                        className="text-sm text-gray-700 cursor-pointer hover:text-purple-600 min-w-[60px] text-right"
                        onClick={() =>
                          setEditingEntry({
                            id: entry.id,
                            km: entry.distance_km != null ? String(entry.distance_km) : '',
                          })
                        }
                        title="Kliknij aby edytować"
                      >
                        {entry.distance_km != null ? `${entry.distance_km} km` : (
                          <span className="text-gray-400 italic">brak km</span>
                        )}
                      </span>
                      <button
                        onClick={() =>
                          setEditingEntry({
                            id: entry.id,
                            km: entry.distance_km != null ? String(entry.distance_km) : '',
                          })
                        }
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title="Edytuj kilometry"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteEntryId(entry.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Usuń klienta"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Confirm delete client entry */}
      <ConfirmModal
        open={!!deleteEntryId}
        onClose={() => setDeleteEntryId(null)}
        onConfirm={handleDeleteEntry}
        title="Usuń klienta z hotelu"
        message="Powiązanie klienta z tym hotelem zostanie usunięte."
        confirmLabel="Usuń"
        variant="danger"
      />
    </div>
  )
}
