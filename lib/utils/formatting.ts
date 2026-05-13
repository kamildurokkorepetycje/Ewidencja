import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  try {
    return format(parseISO(dateString), 'dd.MM.yyyy', { locale: pl })
  } catch {
    return dateString
  }
}

export function formatDateRange(
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined
): string {
  if (!dateFrom) return '-'
  if (!dateTo || dateTo === dateFrom) return formatDate(dateFrom)
  return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 0
): string {
  if (value == null) return '-'
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export function formatKm(value: number | null | undefined): string {
  if (value == null) return '-'
  return `${formatNumber(value, 0)} km`
}

export function formatLiters(value: number | null | undefined): string {
  if (value == null) return '-'
  return `${formatNumber(value, 2)} L`
}

export function formatConsumption(value: number | null | undefined): string {
  if (value == null) return '-'
  return `${formatNumber(value, 2)} L/100km`
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })
}

export function formatOdometer(value: number | null | undefined): string {
  if (value == null) return '-'
  return `${formatNumber(value, 0)} km`
}

export function getMonthName(month: number): string {
  const months = [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
  ]
  return months[month - 1] || `Miesiąc ${month}`
}

export function toDateInputValue(dateString: string | null | undefined): string {
  if (!dateString) return ''
  try {
    return format(parseISO(dateString), 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

export function todayAsInputValue(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
