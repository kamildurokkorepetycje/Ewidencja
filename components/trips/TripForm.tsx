'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { DatePicker } from '@/components/ui/DatePicker'
import { tripSchema } from '@/lib/utils/validation'
import { estimateFuelUsed, detectTripErrors } from '@/lib/utils/calculations'
import { todayAsInputValue } from '@/lib/utils/formatting'
import { createClient } from '@/lib/supabase/client'
import type { Vehicle, Client, Trip, TripLeg, HotelLocation } from '@/lib/types'
import {
  Search, PlusCircle, Plus, Trash2, Hotel,
  Car, Droplets, FileText, MapPin,
  ArrowLeftRight, ArrowRight, CalendarDays, Gauge,
  AlertCircle, CheckCircle2, ChevronRight, Fuel
} from 'lucide-react'
import toast from 'react-hot-toast'

interface TripFormProps {
  initialData?: Trip
  vehicles: Vehicle[]
  clients: Client[]
  hotels?: HotelLocation[]
  lastOdometer?: number | null
  lastFuel?: number | null
}

// Generate date range array
function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(from)
  const end = new Date(to)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function formatDay(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}

const HOME_CITY = 'Katowice'

function buildDefaultLegs(
  dateFrom: string,
  dateTo: string,
  clientDistanceKm: number | null,
  clientCity?: string | null
): TripLeg[] {
  const days = dateRange(dateFrom, dateTo)
  const km = clientDistanceKm ?? 0
  const dest = clientCity?.trim() || ''
  const legs: TripLeg[] = []
  for (const day of days) {
    legs.push({ day, from: HOME_CITY, to: dest, km })
    legs.push({ day, from: dest, to: HOME_CITY, km })
  }
  return legs
}

export function TripForm({ initialData, vehicles, clients: initialClients, hotels: initialHotels = [], lastOdometer, lastFuel }: TripFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [liveErrors, setLiveErrors] = useState<ReturnType<typeof detectTripErrors>>([])
  const [fuelSurcharge, setFuelSurcharge] = useState<0 | 5 | 10>(0)

  const defaultVehicle = vehicles.find((v) => v.is_active) ?? vehicles[0] ?? null

  // Hotels
  const activeHotels = initialHotels.filter((h) => h.is_active)
  const [availableHotels, setAvailableHotels] = useState<HotelLocation[]>(activeHotels)

  // Single trip-level hotel
  const initHotelId = initialData?.trip_legs?.find((l) => l.hotel_id)?.hotel_id ?? null
  const initHotel = initHotelId ? (initialHotels.find((h) => h.id === initHotelId) ?? null) : null
  const [selectedTripHotel, setSelectedTripHotel] = useState<HotelLocation | null>(initHotel)
  const [tripHotelDropdownOpen, setTripHotelDropdownOpen] = useState(false)
  const tripHotelRef = useRef<HTMLDivElement>(null)
  const [legHotelOpen, setLegHotelOpen] = useState<number | null>(null)

  // Close trip hotel dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tripHotelRef.current && !tripHotelRef.current.contains(e.target as Node)) {
        setTripHotelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function applyHotelToAllLegs(hotel: HotelLocation) {
    const clientCity = selectedClientCity?.trim() || ''
    const hotelKm = (hotel as HotelLocation & { distance_km?: number | null }).distance_km
    setSelectedTripHotel(hotel)
    setTripHotelDropdownOpen(false)
    setLegs((prev) => {
      if (prev.length < 3) return prev
      return prev.map((l, i, arr) => {
        if (i === 0 || i === arr.length - 1) return { ...l, hotel_id: null }
        let posInDay = 0
        for (let j = 0; j < i; j++) { if (arr[j].day === l.day) posInDay++ }
        const isFirst = posInDay % 2 === 0
        const km = hotelKm != null ? hotelKm : l.km
        return isFirst
          ? { ...l, from: hotel.name, to: clientCity, km, hotel_id: hotel.id }
          : { ...l, from: clientCity, to: hotel.name, km, hotel_id: hotel.id }
      })
    })
  }

  function removeHotelFromAllLegs() {
    const clientCity = selectedClientCity?.trim() || ''
    const km = selectedClientKm ?? 0
    setSelectedTripHotel(null)
    setLegs((prev) => prev.map((l, i, arr) => {
      if (i === 0 || i === arr.length - 1) return { ...l, hotel_id: null }
      let posInDay = 0
      for (let j = 0; j < i; j++) { if (arr[j].day === l.day) posInDay++ }
      const isFirst = posInDay % 2 === 0
      return { ...l, from: isFirst ? HOME_CITY : clientCity, to: isFirst ? clientCity : HOME_CITY, km, hotel_id: null }
    }))
  }


  const [clients, setClients] = useState<Client[]>(initialClients)
  const [clientSearch, setClientSearch] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [selectedClientName, setSelectedClientName] = useState('')
  const [selectedClientKm, setSelectedClientKm] = useState<number | null>(null)
  const [selectedClientCity, setSelectedClientCity] = useState<string | null>(null)
  const clientRef = useRef<HTMLDivElement>(null)

  // Trip legs
  const [legs, setLegs] = useState<TripLeg[]>(() => {
    if (initialData?.trip_legs?.length) return initialData.trip_legs
    return buildDefaultLegs(
      initialData?.date_from ?? todayAsInputValue(),
      initialData?.date_to ?? todayAsInputValue(),
      null
    )
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isDirty }
  } = useForm({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      date_from: initialData?.date_from ?? todayAsInputValue(),
      date_to: initialData?.date_to ?? todayAsInputValue(),
      trip_type: initialData?.trip_type ?? 'służbowy',
      vehicle_id: initialData?.vehicle_id ?? defaultVehicle?.id ?? '',
      driver_id: undefined,
      client_id: initialData?.client_id ?? '',
      card_number: initialData?.card_number ?? '',
      odometer_start: initialData?.odometer_start != null
        ? String(initialData.odometer_start)
        : lastOdometer != null ? String(lastOdometer) : '',
      local_km: initialData?.local_km != null ? String(initialData.local_km) : '',
      fuel_start: initialData?.fuel_start != null ? String(initialData.fuel_start) : lastFuel != null ? String(lastFuel) : '',
      fuel_purchased: initialData?.fuel_purchased != null ? String(initialData.fuel_purchased) : '0',
      fuel_end: initialData?.fuel_end != null ? String(initialData.fuel_end) : '',
      invoice_number: initialData?.invoice_number ?? '',
      hotel: initialData?.hotel ?? false,
      hotel_days: initialData?.hotel_days != null ? String(initialData.hotel_days) : '',
      notes: initialData?.notes ?? ''
    }
  })

  const watchedValues = watch()
  const watchDateFrom = watch('date_from')
  const watchDateTo = watch('date_to')

  useEffect(() => {
    if (!isDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Auto-select vehicle
  useEffect(() => {
    if (initialData?.vehicle_id) setValue('vehicle_id', initialData.vehicle_id)
    else if (defaultVehicle) setValue('vehicle_id', defaultVehicle.id)
  }, [])

  // Auto-aktualizacja licznika startowego = lastOdometer + km_lokalne
  const watchLocalKm = watch('local_km')
  useEffect(() => {
    if (!initialData && lastOdometer != null) {
      const local = watchLocalKm ? parseFloat(watchLocalKm) : 0
      setValue('odometer_start', String(lastOdometer + (isNaN(local) ? 0 : local)))
    }
  }, [watchLocalKm])

  // Pre-fill client name when editing
  useEffect(() => {
    if (initialData?.client_id) {
      const c = clients.find((c) => c.id === initialData.client_id)
      if (c) { setSelectedClientName(c.name); setSelectedClientKm(c.distance_km); setSelectedClientCity(c.city ?? null) }
    }
  }, [initialData, clients])

  // Close client dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Rebuild legs when dates change (keep km from client)
  const rebuildLegs = useCallback((from: string, to: string, kmPerLeg: number | null, city?: string | null) => {
    setLegs(buildDefaultLegs(from, to, kmPerLeg, city))
  }, [])

  useEffect(() => {
    if (!initialData) {
      rebuildLegs(watchDateFrom, watchDateTo, selectedClientKm, selectedClientCity)
    }
  }, [watchDateFrom, watchDateTo])

  // Calculated km
  const totalLegsKm = legs.reduce((s, l) => s + (Number(l.km) || 0), 0)
  const odomStart = watchedValues.odometer_start ? parseFloat(watchedValues.odometer_start) : null
  const localKm = watchedValues.local_km ? parseFloat(watchedValues.local_km) : null
  // odomStart = lastOdometer + localKm (auto-aktualizowany przez useEffect)
  const odomEnd = odomStart != null ? odomStart + totalLegsKm : null

  const fuelStart = watchedValues.fuel_start ? parseFloat(watchedValues.fuel_start) : null
  const fuelPurchased = watchedValues.fuel_purchased ? parseFloat(watchedValues.fuel_purchased) : null
  // norma spalania z ustawień pojazdu (stała)
  const activeVehicleObj = vehicles.find((v) => v.id === watchedValues.vehicle_id) ?? defaultVehicle
  const fuelNorm = activeVehicleObj?.fuel_norm ?? null
  const baseFuelUsed = estimateFuelUsed(totalLegsKm || null, fuelNorm)  // norma × km / 100
  const calcFuelUsed = baseFuelUsed != null
    ? parseFloat((baseFuelUsed * (1 + fuelSurcharge / 100)).toFixed(2))
    : null
  // paliwo końcowe = początkowe + zakup - zużyte
  const calcFuelEnd = fuelStart != null && calcFuelUsed != null
    ? fuelStart + (fuelPurchased ?? 0) - calcFuelUsed
    : null

  // Live errors
  useEffect(() => {
    const vehicle = vehicles.find((v) => v.id === watchedValues.vehicle_id) ?? null
    setLiveErrors(detectTripErrors({
      date_from: watchedValues.date_from,
      date_to: watchedValues.date_to,
      trip_type: watchedValues.trip_type as 'służbowy' | 'prywatny',
      vehicle_id: watchedValues.vehicle_id || null,
      driver_id: null,
      client_id: watchedValues.client_id || null,
      odometer_start: odomStart,
      odometer_end: odomEnd,
      fuel_purchased: fuelPurchased,
      invoice_number: watchedValues.invoice_number || null,
      distance_km: totalLegsKm || null
    }, vehicle))
  }, [watchedValues, vehicles, legs])

  // Client search helpers
  const filteredClients = clients
    .filter((c) => {
      if (!c.is_active) return false
      const q = clientSearch.trim().toLowerCase()
      if (!q) return false
      return (
        c.name.toLowerCase().includes(q) ||
        (c.code != null && c.code.toLowerCase().includes(q))
      )
    })
    .slice(0, 8)
  const exactMatch = clients.some((c) => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return false
    return (
      c.name.toLowerCase() === q ||
      (c.code != null && c.code.toLowerCase() === q)
    )
  })

  function handleClientSelect(client: Client) {
    setValue('client_id', client.id)
    setSelectedClientName(client.name)
    setSelectedClientKm(client.distance_km)
    setSelectedClientCity(client.city ?? null)
    setClientSearch('')
    setClientDropdownOpen(false)
    // Rebuild legs with new city and km
    const dest = client.city?.trim() || ''
    const km = client.distance_km ?? 0
    setLegs((prev) => {
      let idx = 0
      return prev.map((l) => {
        const isEven = idx++ % 2 === 0
        return { ...l, from: isEven ? HOME_CITY : dest, to: isEven ? dest : HOME_CITY, km }
      })
    })
    // Fetch hotels assigned to this client
    fetch(`/api/hotels?client_id=${client.id}`)
      .then((r) => r.json())
      .then(({ data }) => setAvailableHotels((data ?? []).filter((h: HotelLocation) => h.is_active)))
      .catch(() => {})
  }

  async function handleCreateClient() {
    const name = clientSearch.trim()
    if (!name) return
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('clients')
        .insert({ name, is_active: true, ...(currentUser ? { user_id: currentUser.id } : {}) })
        .select()
        .single()
      if (error) throw error
      const newClient = data as Client
      setClients((prev) => [...prev, newClient])
      handleClientSelect(newClient)
      toast.success(`Klient "${name}" został utworzony`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd tworzenia klienta')
    }
  }

  function handleClientSearchChange(val: string) {
    setClientSearch(val)
    setSelectedClientName('')
    setSelectedClientKm(null)
    setSelectedClientCity(null)
    setValue('client_id', '')
    setClientDropdownOpen(true)
    setAvailableHotels(activeHotels)
    setSelectedTripHotel(null)
  }

  // Leg helpers
  function updateLeg(idx: number, field: keyof TripLeg, value: string | number) {
    setLegs((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: field === 'km' ? Number(value) : value } : l))
  }

  function addLeg(afterDay?: string) {
    const day = afterDay ?? watchDateFrom
    const km = selectedClientKm ?? 0
    const dest = selectedClientCity?.trim() || ''
    setLegs((prev) => [...prev, { day, from: HOME_CITY, to: dest, km }])
  }

  function removeLeg(idx: number) {
    setLegs((prev) => prev.filter((_, i) => i !== idx))
  }

  function swapLeg(idx: number) {
    setLegs((prev) => prev.map((l, i) => i === idx ? { ...l, from: l.to, to: l.from } : l))
  }

  function updateLegHotel(idx: number, hotel: HotelLocation | null) {
    const clientCity = selectedClientCity?.trim() || ''
    const hotelKm = hotel ? (hotel as HotelLocation & { distance_km?: number | null }).distance_km : null
    setLegs((prev) => prev.map((l, i) => {
      if (i !== idx) return l
      let posInDay = 0
      for (let j = 0; j < i; j++) { if (prev[j].day === l.day) posInDay++ }
      const isFirst = posInDay % 2 === 0
      if (!hotel) {
        const km = selectedClientKm ?? 0
        return { ...l, from: isFirst ? HOME_CITY : clientCity, to: isFirst ? clientCity : HOME_CITY, km, hotel_id: null }
      }
      const km = hotelKm != null ? hotelKm : l.km
      return isFirst
        ? { ...l, from: hotel.name, to: clientCity, km, hotel_id: hotel.id }
        : { ...l, from: clientCity, to: hotel.name, km, hotel_id: hotel.id }
    }))
  }

  useEffect(() => {
    if (legHotelOpen === null) return
    function handleClose() { setLegHotelOpen(null) }
    document.addEventListener('click', handleClose)
    return () => document.removeEventListener('click', handleClose)
  }, [legHotelOpen])

  // Days count
  const tripDays =
    watchDateFrom && watchDateTo
      ? Math.max(1, Math.round((new Date(watchDateTo).getTime() - new Date(watchDateFrom).getTime()) / 86400000) + 1)
      : null

  // Fuel gauge helpers
  const tankCapacity = activeVehicleObj?.tank_capacity ?? null
  const fuelBarPct = calcFuelEnd != null && tankCapacity != null && tankCapacity > 0
    ? Math.min(100, Math.max(0, (calcFuelEnd / tankCapacity) * 100))
    : calcFuelEnd != null && fuelStart != null && fuelStart > 0
      ? Math.min(100, Math.max(0, (calcFuelEnd / fuelStart) * 100))
      : null

  const fuelBarColor =
    fuelBarPct == null ? 'bg-gray-300'
    : fuelBarPct < 15 ? 'bg-red-500'
    : fuelBarPct < 30 ? 'bg-amber-400'
    : 'bg-emerald-500'

  async function onSubmit(formData: Record<string, unknown>) {
    setLoading(true)
    try {
      const payload = {
        ...formData,
        odometer_start: odomStart,
        odometer_end: odomEnd,
        distance_km: totalLegsKm || null,
        local_km: localKm,
        trip_legs: legs,
        fuel_start: fuelStart,
        fuel_purchased: fuelPurchased,
        fuel_end: calcFuelEnd,
        fuel_used: calcFuelUsed,
        avg_consumption: fuelNorm,
        hotel_days: formData.hotel_days ? parseInt(String(formData.hotel_days), 10) : null,
        client_id: formData.client_id || null,
        driver_id: null,
        card_number: formData.card_number || null,
        invoice_number: formData.invoice_number || null,
        notes: formData.notes || null
      }

      const url = initialData ? `/api/trips/${initialData.id}` : '/api/trips'
      const method = initialData ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const { error } = await res.json(); throw new Error(error ?? 'Błąd zapisu') }

      toast.success(initialData ? 'Przejazd zaktualizowany' : 'Przejazd dodany')
      router.push('/przejazdy?t=' + Date.now())
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu przejazdu')
    } finally {
      setLoading(false)
    }
  }

  // Group legs by day for display
  const legsByDay = legs.reduce<Record<string, { leg: TripLeg; idx: number }[]>>((acc, leg, idx) => {
    if (!acc[leg.day]) acc[leg.day] = []
    acc[leg.day].push({ leg, idx })
    return acc
  }, {})

  const errCount = liveErrors.filter((e) => e.severity === 'error').length
  const warnCount = liveErrors.filter((e) => e.severity === 'warning').length

  return (
    <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])}>
      <div className="flex flex-col lg:flex-row gap-6 lg:items-start">

        {/* ─── LEFT: main form ─── */}
        <div className="w-full flex-1 min-w-0 space-y-5">

          {/* Validation alerts */}
          {errCount > 0 && (
            <Alert variant="error" title="Wykryto błędy">
              <ul className="space-y-0.5 mt-1">
                {liveErrors.filter((e) => e.severity === 'error').map((e, i) => (
                  <li key={i} className="flex items-start gap-2"><AlertCircle size={13} className="mt-0.5 shrink-0" />{e.message}</li>
                ))}
              </ul>
            </Alert>
          )}
          {warnCount > 0 && (
            <Alert variant="warning">
              <ul className="space-y-0.5">
                {liveErrors.filter((e) => e.severity === 'warning').map((e, i) => (
                  <li key={i} className="flex items-start gap-2"><AlertCircle size={13} className="mt-0.5 shrink-0" />{e.message}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* ── Section 1: Podstawowe dane ── */}
          <div className="surface overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-100 bg-slate-50">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-600 text-white text-xs font-bold shrink-0">1</span>
              <div className="flex items-center gap-2">
                <Car size={15} className="text-primary-600" />
                <h3 className="font-semibold text-slate-800 text-sm">Podstawowe dane</h3>
              </div>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              {defaultVehicle && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary-50 border border-primary-100">
                  <Car size={16} className="text-primary-500 shrink-0" />
                  <div>
                    <p className="text-xs text-primary-500 font-medium">Pojazd</p>
                    <p className="text-sm font-semibold text-primary-800">
                      {defaultVehicle.brand} {defaultVehicle.model}
                      <span className="ml-2 font-normal text-primary-600">({defaultVehicle.registration_number})</span>
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Controller
                  name="date_from"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      label="Data od"
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.date_from?.message}
                    />
                  )}
                />
                <Controller
                  name="date_to"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      label="Data do"
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.date_to?.message}
                    />
                  )}
                />
                <Controller
                  name="trip_type"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label="Typ przejazdu"
                      error={errors.trip_type?.message}
                      options={[{ value: 'służbowy', label: 'Służbowy' }, { value: 'prywatny', label: 'Prywatny' }]}
                      {...field}
                    />
                  )}
                />
                {/* Client search */}
                <div ref={clientRef} className="relative flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700">Klient</label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={selectedClientName || clientSearch}
                      onChange={(e) => handleClientSearchChange(e.target.value)}
                      onFocus={() => setClientDropdownOpen(true)}
                      placeholder="Szukaj klienta..."
                      className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                    />
                    {(selectedClientName || clientSearch) && (
                      <button
                        type="button"
                        onClick={() => { setClientSearch(''); setSelectedClientName(''); setValue('client_id', ''); setAvailableHotels(activeHotels); setSelectedTripHotel(null) }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {clientDropdownOpen && clientSearch.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {filteredClients.map((c) => (
                        <button key={c.id} type="button" onMouseDown={() => handleClientSelect(c)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50 border-b border-gray-50 last:border-0 flex items-center justify-between group">
                          <span>
                            {c.code && <span className="text-slate-400 mr-1.5 text-xs">[{c.code}]</span>}
                            {c.name}
                          </span>
                          {c.distance_km != null && (
                            <span className="text-xs text-slate-400 group-hover:text-primary-500">{c.distance_km} km</span>
                          )}
                        </button>
                      ))}
                      {!exactMatch && clientSearch.trim().length > 0 && (
                        <button type="button" onMouseDown={handleCreateClient}
                          className="w-full text-left px-4 py-2.5 text-sm text-primary-600 hover:bg-primary-50 flex items-center gap-2 font-medium">
                          <PlusCircle size={14} />
                          Utwórz klienta &ldquo;{clientSearch.trim()}&rdquo;
                        </button>
                      )}
                    </div>
                  )}
                  {errors.client_id?.message && (
                    <p className="text-xs text-red-500 mt-0.5">{errors.client_id.message}</p>
                  )}
                </div>
                <Input label="Numer karty / POP" placeholder="np. POP-001" {...register('card_number')} />
              </div>
            </div>
          </div>

          {/* ── Section 2: Trasy wyjazdu ── */}
          <div className="surface overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-100 bg-slate-50">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600 text-white text-xs font-bold shrink-0">2</span>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MapPin size={15} className="text-indigo-600 shrink-0" />
                <h3 className="font-semibold text-slate-800 text-sm truncate">Trasy wyjazdu</h3>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
              {/* Trip-level hotel selector */}
              <div className="relative" ref={tripHotelRef}>
                {selectedTripHotel ? (
                  <div className="flex items-center gap-1">
                    <span className="flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full max-w-[100px] sm:max-w-none">
                      <Hotel size={11} className="shrink-0" />
                      <span className="truncate">{selectedTripHotel.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={removeHotelFromAllLegs}
                      className="text-xs text-purple-400 hover:text-red-500 transition p-0.5"
                      title="Usu\u0144 hotel"
                    >✕</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTripHotelDropdownOpen(!tripHotelDropdownOpen)}
                    className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-purple-600 hover:bg-purple-50 px-2.5 py-1 rounded-full transition"
                  >
                    <Hotel size={11} />Hotel
                  </button>
                )}
                {tripHotelDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 z-[100] bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px] overflow-hidden">
                    <div className="px-3 pt-3 pb-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Wybierz hotel</p>
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {availableHotels.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-slate-400 text-center">Brak hoteli przypisanych do klienta</p>
                      ) : (
                        availableHotels.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onMouseDown={() => applyHotelToAllLegs(h)}
                            className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 transition
                              ${selectedTripHotel?.id === h.id ? 'bg-purple-50 text-purple-700' : 'hover:bg-slate-50 text-slate-800'}`}
                          >
                            <div className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0
                              ${selectedTripHotel?.id === h.id ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                              <Hotel size={13} />
                            </div>
                            <span className="flex-1 min-w-0">
                              <span className="block font-medium truncate">{h.name}</span>
                              {h.city && <span className="block text-xs text-slate-400 truncate">{h.city}</span>}
                            </span>
                            {selectedTripHotel?.id === h.id && <CheckCircle2 size={14} className="text-purple-500 shrink-0" />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-full whitespace-nowrap">
                {totalLegsKm} km
              </span>
              </div>
            </div>
            <div className="p-4 sm:p-5 space-y-3">
              {Object.entries(legsByDay).map(([day, dayLegs]) => (
                <div key={day} className="rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={13} className="text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">{formatDay(day)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => addLeg(day)}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
                    >
                      <Plus size={12} />dodaj etap
                    </button>
                  </div>
                  {/* Desktop header */}
                  <div className="hidden sm:grid grid-cols-[1fr_20px_1fr_80px_76px] border-b border-slate-100">
                    <div className="text-left px-3 py-2 text-xs text-slate-400 font-medium">Skąd</div>
                    <div />
                    <div className="text-left px-3 py-2 text-xs text-slate-400 font-medium">Dokąd</div>
                    <div className="text-right px-3 py-2 text-xs text-slate-400 font-medium">km</div>
                    <div />
                  </div>
                  {dayLegs.map(({ leg, idx }) => (
                    <div key={idx} className="border-b border-gray-50 last:border-0 group">
                      {/* Mobile: card */}
                      <div className="sm:hidden px-3 py-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={leg.from}
                            onChange={(e) => updateLeg(idx, 'from', e.target.value)}
                            placeholder="Skąd"
                            className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 focus:outline-none bg-white transition"
                          />
                          <ArrowRight size={13} className="shrink-0 text-slate-300" />
                          <input
                            type="text"
                            value={leg.to}
                            onChange={(e) => updateLeg(idx, 'to', e.target.value)}
                            placeholder="Dokąd"
                            className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 focus:outline-none bg-white transition"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 shrink-0">km:</span>
                          <input
                            type="number"
                            value={leg.km}
                            onChange={(e) => updateLeg(idx, 'km', e.target.value)}
                            className="w-20 px-2 py-1.5 text-sm text-right rounded-lg border border-slate-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 focus:outline-none bg-white transition font-medium"
                            min="0"
                          />
                          <div className="flex-1" />
                          {/* Per-leg hotel button (mobile) */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setLegHotelOpen(legHotelOpen === idx ? null : idx) }}
                              className={`p-2 rounded-lg transition ${
                                leg.hotel_id ? 'text-purple-500 hover:text-purple-700 hover:bg-purple-50' : 'text-slate-300 hover:text-purple-500 hover:bg-purple-50'
                              }`}
                              title={leg.hotel_id ? 'Zmień hotel' : 'Dodaj hotel'}
                            >
                              <Hotel size={14} />
                            </button>
                            {legHotelOpen === idx && (
                              <div
                                className="absolute right-0 bottom-full mb-1 z-[200] bg-white border border-slate-200 rounded-lg shadow-lg min-w-[190px] overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {leg.hotel_id && (
                                  <button type="button" onMouseDown={() => { updateLegHotel(idx, null); setLegHotelOpen(null) }}
                                    className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 border-b border-slate-100">
                                    ✕ Usuń hotel
                                  </button>
                                )}
                                {availableHotels.length === 0
                                  ? <p className="px-3 py-3 text-xs text-slate-400 text-center">Brak hoteli dla klienta</p>
                                  : availableHotels.map((h) => (
                                    <button key={h.id} type="button" onMouseDown={() => { updateLegHotel(idx, h); setLegHotelOpen(null) }}
                                      className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition ${
                                        leg.hotel_id === h.id ? 'bg-purple-50 text-purple-700' : 'hover:bg-slate-50 text-slate-800'
                                      }`}>
                                      <Hotel size={12} className={leg.hotel_id === h.id ? 'text-purple-500' : 'text-slate-400'} />
                                      {h.name}
                                    </button>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => swapLeg(idx)}
                            title="Zamień kierunek"
                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition"
                          >
                            <ArrowLeftRight size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLeg(idx)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {/* Desktop: grid row */}
                      <div className="hidden sm:grid grid-cols-[1fr_20px_1fr_80px_76px] items-center hover:bg-slate-50/70 transition-colors">
                        <div className="px-2 py-1.5">
                          <input
                            type="text"
                            value={leg.from}
                            onChange={(e) => updateLeg(idx, 'from', e.target.value)}
                            placeholder="Skąd"
                            className="w-full px-2 py-1 text-sm rounded-lg border border-transparent group-hover:border-slate-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 focus:outline-none bg-transparent transition"
                          />
                        </div>
                        <div className="text-center">
                          <ArrowRight size={11} className="text-slate-300" />
                        </div>
                        <div className="px-2 py-1.5">
                          <input
                            type="text"
                            value={leg.to}
                            onChange={(e) => updateLeg(idx, 'to', e.target.value)}
                            placeholder="Dokąd"
                            className="w-full px-2 py-1 text-sm rounded-lg border border-transparent group-hover:border-slate-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 focus:outline-none bg-transparent transition"
                          />
                        </div>
                        <div className="px-2 py-1.5">
                          <input
                            type="number"
                            value={leg.km}
                            onChange={(e) => updateLeg(idx, 'km', e.target.value)}
                            className="w-full px-2 py-1 text-sm text-right rounded-lg border border-transparent group-hover:border-slate-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 focus:outline-none bg-transparent transition font-medium"
                            min="0"
                          />
                        </div>
                        <div className="px-1 py-1.5">
                          <div className="flex items-center justify-center gap-0.5">
                            {/* Per-leg hotel button (desktop) */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setLegHotelOpen(legHotelOpen === idx ? null : idx) }}
                                className={`p-1 rounded-lg transition ${
                                  leg.hotel_id ? 'text-purple-500 hover:text-purple-700 hover:bg-purple-50' : 'text-slate-300 hover:text-purple-500 hover:bg-purple-50'
                                }`}
                                title={leg.hotel_id ? 'Zmień hotel' : 'Dodaj hotel'}
                              >
                                <Hotel size={12} />
                              </button>
                              {legHotelOpen === idx && (
                                <div
                                  className="absolute right-0 top-full mt-1 z-[200] bg-white border border-slate-200 rounded-lg shadow-lg min-w-[190px] overflow-hidden"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {leg.hotel_id && (
                                    <button type="button" onMouseDown={() => { updateLegHotel(idx, null); setLegHotelOpen(null) }}
                                      className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 border-b border-slate-100">
                                      ✕ Usuń hotel
                                    </button>
                                  )}
                                  {availableHotels.length === 0
                                    ? <p className="px-3 py-3 text-xs text-slate-400 text-center">Brak hoteli dla klienta</p>
                                    : availableHotels.map((h) => (
                                      <button key={h.id} type="button" onMouseDown={() => { updateLegHotel(idx, h); setLegHotelOpen(null) }}
                                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition ${
                                          leg.hotel_id === h.id ? 'bg-purple-50 text-purple-700' : 'hover:bg-slate-50 text-slate-800'
                                        }`}>
                                        <Hotel size={12} className={leg.hotel_id === h.id ? 'text-purple-500' : 'text-slate-400'} />
                                        {h.name}
                                      </button>
                                    ))
                                  }
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => swapLeg(idx)}
                              title="Zamień kierunek"
                              className="p-1 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition"
                            >
                              <ArrowLeftRight size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLeg(idx)}
                              className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {legs.length === 0 && (
                <button
                  type="button"
                  onClick={() => addLeg()}
                  className="w-full py-6 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-600 flex items-center justify-center gap-2 transition"
                >
                  <Plus size={15} />Dodaj pierwszy etap trasy
                </button>
              )}

              {/* Odometer row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 mt-1">
                <Input
                  label="Km lokalne"
                  type="number"
                  placeholder="0"
                  hint="Jazdy w obrębie miejscowości"
                  {...register('local_km')}
                />
                <Input
                  label="Licznik startowy (km)"
                  type="number"
                  placeholder="np. 123456"
                  hint={lastOdometer != null ? `Poprzedni: ${lastOdometer} km` : undefined}
                  error={errors.odometer_start?.message}
                  {...register('odometer_start')}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Gauge size={13} className="text-indigo-500" />
                    Licznik końcowy
                  </label>
                  <div className="flex items-center h-[38px] px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-sm font-bold text-indigo-700 tabular-nums">
                    {odomEnd != null ? `${odomEnd.toFixed(0)} km` : '–'}
                  </div>
                  {odomEnd != null && odomStart != null && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <ChevronRight size={10} />{odomStart} + {totalLegsKm} = {odomEnd.toFixed(0)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 3: Paliwo ── */}
          <div className="surface overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-100 bg-slate-50">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500 text-white text-xs font-bold shrink-0">3</span>
              <div className="flex items-center gap-2">
                <Droplets size={15} className="text-amber-600" />
                <h3 className="font-semibold text-slate-800 text-sm">Paliwo</h3>
              </div>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Paliwo początkowe (L)" type="number" step="0.01" placeholder="np. 45.0"
                  error={errors.fuel_start?.message} {...register('fuel_start')} />
                <Input label="Zakup paliwa (L)" type="number" step="0.01" placeholder="0"
                  error={errors.fuel_purchased?.message} {...register('fuel_purchased')} />
              </div>

              {/* P5 / P10 surcharge */}
              <div className="flex items-center gap-4">
                <span className="text-xs font-medium text-slate-500">Naddatek spalania:</span>
                {([5, 10] as const).map((val) => (
                  <label key={val} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                      checked={fuelSurcharge === val}
                      onChange={() => setFuelSurcharge(fuelSurcharge === val ? 0 : val)}
                    />
                    <span className={`text-sm font-semibold ${
                      fuelSurcharge === val ? 'text-amber-600' : 'text-slate-600'
                    }`}>P{val} <span className="font-normal text-xs text-slate-400">(+{val}%)</span></span>
                  </label>
                ))}
              </div>

              {/* Fuel computed row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Fuel size={13} className="text-amber-500" />
                    Zużyte paliwo (auto)
                  </label>
                  <div className="flex items-center h-[38px] px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-sm font-bold text-amber-700 tabular-nums">
                    {calcFuelUsed != null ? `${calcFuelUsed.toFixed(2)} L` : '–'}
                  </div>
                  {fuelNorm != null && (
                    <p className="text-xs text-slate-400">
                      {fuelNorm} L/100km × {totalLegsKm} km
                      {fuelSurcharge > 0 && (
                        <span className="text-amber-500 font-medium"> + P{fuelSurcharge}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Droplets size={13} className="text-emerald-500" />
                    Paliwo końcowe (auto)
                  </label>
                  <div className={`flex items-center h-[38px] px-3 py-2 rounded-lg border text-sm font-bold tabular-nums
                    ${fuelBarPct != null && fuelBarPct < 15 ? 'bg-red-50 border-red-200 text-red-700'
                    : fuelBarPct != null && fuelBarPct < 30 ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                    {calcFuelEnd != null ? `${calcFuelEnd.toFixed(1)} L` : '–'}
                  </div>
                  {fuelBarPct != null && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${fuelBarColor}`}
                          style={{ width: `${fuelBarPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 tabular-nums w-8 text-right">{fuelBarPct.toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              </div>

              <Input label="Numer faktury" placeholder="np. FV/2025/001" {...register('invoice_number')} />
            </div>
          </div>

          {/* ── Section 4: Uwagi ── */}
          <div className="surface overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-100 bg-slate-50">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-500 text-white text-xs font-bold shrink-0">4</span>
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-slate-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Uwagi</h3>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <Textarea label="" placeholder="Dodatkowe informacje o przejeździe..." {...register('notes')} />
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pb-6">
            <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1 sm:flex-none justify-center">Anuluj</Button>
            <Button type="submit" loading={loading} className="flex-1 justify-center">
              {initialData ? 'Zapisz zmiany' : 'Dodaj przejazd'}
            </Button>
          </div>
        </div>

        {/* ─── RIGHT: sticky summary panel ─── */}
        <div className="hidden lg:block lg:w-80 shrink-0 lg:sticky lg:top-4 space-y-4">
          <div className="surface overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-900">
              <h3 className="text-sm font-semibold text-white">Podsumowanie</h3>
              <p className="text-xs text-slate-400 mt-0.5">Aktualizuje się na bieżąco</p>
              {isDirty && (
                <p className="text-xs text-amber-200 mt-1 font-medium">Niezapisane zmiany</p>
              )}
            </div>
            <div className="p-4 space-y-3">

              {/* Dates */}
              <div className="flex items-start gap-3">
                <CalendarDays size={15} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 font-medium">Okres</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {watchDateFrom && watchDateTo
                      ? `${watchDateFrom} – ${watchDateTo}`
                      : '–'}
                  </p>
                  {tripDays != null && (
                    <p className="text-xs text-slate-400">{tripDays} {tripDays === 1 ? 'dzień' : tripDays < 5 ? 'dni' : 'dni'}</p>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Distance */}
              <div className="flex items-start gap-3">
                <Gauge size={15} className="text-indigo-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-slate-400 font-medium">Dystans</p>
                  <p className="text-2xl font-bold text-indigo-700 tabular-nums leading-tight">
                    {totalLegsKm > 0 ? totalLegsKm : '–'}
                    {totalLegsKm > 0 && <span className="text-sm font-medium text-indigo-400 ml-1">km</span>}
                  </p>
                  {odomEnd != null && (
                    <p className="text-xs text-slate-400">Licznik: {odomStart} → {odomEnd.toFixed(0)}</p>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Fuel */}
              <div className="flex items-start gap-3">
                <Droplets size={15} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-slate-400 font-medium">Paliwo końcowe</p>
                  <p className={`text-2xl font-bold tabular-nums leading-tight
                    ${calcFuelEnd == null ? 'text-slate-300'
                    : fuelBarPct != null && fuelBarPct < 15 ? 'text-red-600'
                    : fuelBarPct != null && fuelBarPct < 30 ? 'text-amber-600'
                    : 'text-emerald-600'}`}>
                    {calcFuelEnd != null ? calcFuelEnd.toFixed(1) : '–'}
                    {calcFuelEnd != null && <span className="text-sm font-medium text-slate-400 ml-1">L</span>}
                  </p>
                  {fuelBarPct != null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${fuelBarColor}`}
                          style={{ width: `${fuelBarPct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 tabular-nums">{fuelBarPct.toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Validation status */}
              {(errCount > 0 || warnCount > 0) && (
                <>
                  <div className="border-t border-slate-100" />
                  <div className="space-y-1.5">
                    {errCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-red-600 font-medium">
                        <AlertCircle size={13} />{errCount} {errCount === 1 ? 'błąd' : 'błędy'}
                      </div>
                    )}
                    {warnCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 font-medium">
                        <AlertCircle size={13} />{warnCount} ostrzeżeni{warnCount === 1 ? 'e' : 'a'}
                      </div>
                    )}
                  </div>
                </>
              )}
              {errCount === 0 && warnCount === 0 && totalLegsKm > 0 && (
                <>
                  <div className="border-t border-slate-100" />
                  <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 size={13} />Dane wyglądają poprawnie
                  </div>
                </>
              )}
            </div>

            {/* Action buttons in panel */}
            <div className="px-4 pb-4 space-y-2">
              <Button type="submit" loading={loading} className="w-full justify-center">
                {initialData ? 'Zapisz zmiany' : 'Dodaj przejazd'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()} className="w-full justify-center">
                Anuluj
              </Button>
            </div>
          </div>
        </div>

      </div>
    </form>
  )
}

