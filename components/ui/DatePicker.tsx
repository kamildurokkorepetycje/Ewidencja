'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { pl } from 'date-fns/locale'
import { format, parse, isValid } from 'date-fns'
import { Calendar, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface DatePickerProps {
  value?: string       // YYYY-MM-DD
  onChange: (value: string) => void
  label?: string
  error?: string
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DatePicker({
  value,
  onChange,
  label,
  error,
  placeholder,
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)

  const parsedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const selectedDate = parsedDate && isValid(parsedDate) ? parsedDate : undefined

  function openCalendar() {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const calH = 340
    const top = spaceBelow >= calH ? rect.bottom + 6 : rect.top - calH - 6
    setPos({ top, left: rect.left, width: rect.width })
    setOpen(true)
  }

  // Close on outside click / touch
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node
      if (
        calendarRef.current && !calendarRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  // Close on Escape / scroll
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function onScroll() { setOpen(false) }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <div className={cn('relative flex flex-col gap-1', className)}>
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={openCalendar}
        className={cn(
          'w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-white text-left transition-colors shadow-sm',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500',
          'focus:outline-none focus:ring-1',
          disabled && 'opacity-50 pointer-events-none bg-gray-50'
        )}
      >
        <Calendar size={15} className="text-gray-400 shrink-0" />
        {selectedDate ? (
          <span className="text-gray-900 flex-1">
            {format(selectedDate, 'dd.MM.yyyy')}
          </span>
        ) : (
          <span className="text-gray-400 flex-1">{placeholder ?? 'Wybierz datę'}</span>
        )}
        {selectedDate && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange('') } }}
            className="text-gray-300 hover:text-gray-500 transition-colors"
          >
            <X size={13} />
          </span>
        )}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {open && typeof window !== 'undefined' && (() => {
        const isMobile = window.innerWidth < 640
        return (
          <>
            {/* Backdrop (mobile only) */}
            {isMobile && (
              <div
                className="fixed inset-0 z-40 bg-black/30"
                onClick={() => setOpen(false)}
              />
            )}

            {/* Calendar */}
            <div
              ref={calendarRef}
              style={
                isMobile
                  ? undefined
                  : { top: pos?.top, left: pos?.left, minWidth: pos?.width }
              }
              className={cn(
                'z-50 bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 w-[min(320px,95vw)]',
                isMobile
                  ? 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
                  : 'fixed'
              )}
            >
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) onChange(format(date, 'yyyy-MM-dd'))
                  setOpen(false)
                }}
                weekStartsOn={1}
                locale={pl}
                showOutsideDays
                captionLayout="dropdown"
                classNames={{
                  root: 'w-full',
                  months: 'w-full',
                  month: 'w-full',
                  month_caption: 'flex items-center justify-between px-1 mb-3',
                  caption_label: 'hidden',
                  dropdowns: 'flex items-center gap-2 flex-1',
                  dropdown: 'text-sm font-semibold text-gray-900 bg-transparent border-none outline-none cursor-pointer px-0',
                  dropdown_root: 'relative',
                  nav: 'flex items-center gap-1',
                  button_previous: 'w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors',
                  button_next: 'w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors',
                  month_grid: 'w-full border-collapse',
                  weekdays: 'flex',
                  weekday: 'flex-1 text-center text-xs font-semibold text-gray-400 uppercase py-1',
                  weeks: 'mt-1',
                  week: 'flex',
                  day: 'flex-1 p-0.5',
                  day_button: cn(
                    'w-full aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-colors',
                    'hover:bg-primary-50 hover:text-primary-700',
                    'focus:outline-none focus:ring-2 focus:ring-primary-400'
                  ),
                  selected: '[&>button]:!bg-primary-600 [&>button]:!text-white [&>button]:hover:!bg-primary-700',
                  today: '[&>button]:ring-1 [&>button]:ring-primary-400',
                  outside: '[&>button]:text-gray-300',
                  disabled: '[&>button]:text-gray-200 [&>button]:pointer-events-none',
                }}
              />
            </div>
          </>
        )
      })()}
    </div>
  )
}
