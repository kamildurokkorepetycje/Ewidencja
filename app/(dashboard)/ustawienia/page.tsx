'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { User as UserIcon, Lock, Car } from 'lucide-react'

export default function UstawieniaPage() {
  const [user, setUser] = useState<User | null>(null)
  const [fullName, setFullName] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)

  // Password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  // Vehicle
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [vehicleForm, setVehicleForm] = useState({
    brand: '',
    model: '',
    registration_number: '',
    fuel_norm: '',
    tank_capacity: '',
    starting_mileage: '',
    starting_fuel: ''
  })
  const [vehicleLoading, setVehicleLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      if (profile) setFullName(profile.full_name ?? '')

      // Load first active vehicle for this user
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('*')
        .eq('is_active', true)
        .limit(1)
      if (vehicles && vehicles.length > 0) {
        const v = vehicles[0]
        setVehicleId(v.id)
        setVehicleForm({
          brand: v.brand ?? '',
          model: v.model ?? '',
          registration_number: v.registration_number ?? '',
          fuel_norm: v.fuel_norm != null ? String(v.fuel_norm) : '',
          tank_capacity: v.tank_capacity != null ? String(v.tank_capacity) : '',
          starting_mileage: v.starting_mileage != null ? String(v.starting_mileage) : '',
          starting_fuel: v.starting_fuel != null ? String(v.starting_fuel) : ''
        })
      }
    }
    fetchData()
  }, [])

  const handleProfileSave = async () => {
    if (!user) return
    setProfileLoading(true)
    try {
      const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
      if (error) throw error
      toast.success('Profil zaktualizowany')
    } catch {
      toast.error('Błąd zapisu profilu')
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    setPasswordError('')
    if (!newPassword) { setPasswordError('Podaj nowe hasło'); return }
    if (newPassword.length < 8) { setPasswordError('Hasło musi mieć co najmniej 8 znaków'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Hasła nie są zgodne'); return }
    setPasswordLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Hasło zmienione')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e: unknown) {
      setPasswordError(e instanceof Error ? e.message : 'Błąd zmiany hasła')
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleVehicleSave = async () => {
    if (!vehicleForm.registration_number) {
      toast.error('Numer rejestracyjny jest wymagany')
      return
    }
    setVehicleLoading(true)
    try {
      const payload = {
        brand: vehicleForm.brand || 'Mój pojazd',
        model: vehicleForm.model || '',
        registration_number: vehicleForm.registration_number,
        fuel_norm: vehicleForm.fuel_norm ? parseFloat(vehicleForm.fuel_norm) : null,
        tank_capacity: vehicleForm.tank_capacity ? parseFloat(vehicleForm.tank_capacity) : null,
        starting_mileage: vehicleForm.starting_mileage ? parseFloat(vehicleForm.starting_mileage) : null,
        starting_fuel: vehicleForm.starting_fuel ? parseFloat(vehicleForm.starting_fuel) : null,
        is_active: true
      }

      if (vehicleId) {
        const { error } = await supabase.from('vehicles').update(payload).eq('id', vehicleId).eq('user_id', user!.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('vehicles').insert({ ...payload, user_id: user!.id }).select().single()
        if (error) throw error
        setVehicleId(data.id)
      }
      toast.success('Pojazd zapisany')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu pojazdu')
    } finally {
      setVehicleLoading(false)
    }
  }

  return (
    <div>
      <Header title="Ustawienia" />
      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-6">

        {/* Profile */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <UserIcon size={18} className="text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">Profil użytkownika</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Email</p>
              <p className="font-medium text-gray-800">{user?.email ?? '—'}</p>
            </div>
            <Input
              label="Imię i nazwisko"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jan Kowalski"
            />
            <div className="flex justify-end">
              <Button onClick={handleProfileSave} loading={profileLoading} size="sm">Zapisz profil</Button>
            </div>
          </div>
        </div>

        {/* Vehicle */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Car size={18} className="text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">Mój pojazd</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Marka"
                value={vehicleForm.brand}
                onChange={e => setVehicleForm(f => ({ ...f, brand: e.target.value }))}
                placeholder="np. Škoda"
              />
              <Input
                label="Model"
                value={vehicleForm.model}
                onChange={e => setVehicleForm(f => ({ ...f, model: e.target.value }))}
                placeholder="np. Octavia"
              />
              <Input
                label="Nr rejestracyjny *"
                value={vehicleForm.registration_number}
                onChange={e => setVehicleForm(f => ({ ...f, registration_number: e.target.value }))}
                placeholder="np. WA 12345"
              />
              <Input
                label="Norma spalania (L/100km)"
                type="number"
                step="0.1"
                value={vehicleForm.fuel_norm}
                onChange={e => setVehicleForm(f => ({ ...f, fuel_norm: e.target.value }))}
                placeholder="np. 6.5"
              />
              <Input
                label="Pojemność zbiornika (L)"
                type="number"
                value={vehicleForm.tank_capacity}
                onChange={e => setVehicleForm(f => ({ ...f, tank_capacity: e.target.value }))}
                placeholder="np. 55"
              />
              <div /> {/* spacer */}
              <Input
                label="Przebieg początkowy (km)"
                type="number"
                value={vehicleForm.starting_mileage}
                onChange={e => setVehicleForm(f => ({ ...f, starting_mileage: e.target.value }))}
                placeholder="np. 0"
              />
              <Input
                label="Paliwo startowe (L)"
                type="number"
                value={vehicleForm.starting_fuel}
                onChange={e => setVehicleForm(f => ({ ...f, starting_fuel: e.target.value }))}
                placeholder="np. 0"
              />
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleVehicleSave} loading={vehicleLoading} size="sm">
                {vehicleId ? 'Zapisz zmiany' : 'Utwórz pojazd'}
              </Button>
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Lock size={18} className="text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">Zmiana hasła</h2>
          </div>
          <div className="p-6 space-y-4">
            {passwordError && <Alert variant="error">{passwordError}</Alert>}
            <Input
              label="Nowe hasło"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              hint="Minimum 8 znaków"
            />
            <Input
              label="Potwierdź nowe hasło"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={handlePasswordChange} loading={passwordLoading} size="sm">Zmień hasło</Button>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-gray-400 text-center">
          Ewidencja Przejazdów v1.0 · Next.js + Supabase
        </div>
      </div>
    </div>
  )
}