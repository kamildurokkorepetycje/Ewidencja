'use client'

import { useState, useRef } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { Spinner } from '@/components/ui/Spinner'
import { parseExcelFile, autoDetectMapping, TRIP_COLUMN_SUGGESTIONS, CLIENT_COLUMN_SUGGESTIONS } from '@/lib/utils/excel'
import { Upload, CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

type ImportType = 'clients' | 'trips'
type Step = 1 | 2 | 3 | 4 | 5

interface ParsedFile {
  sheetNames: string[]
  rows: Record<string, unknown>[]
  columns: string[]
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [selectedSheet, setSelectedSheet] = useState('')
  const [importType, setImportType] = useState<ImportType>('trips')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Record<string, unknown>[]>([])
  const [importResult, setImportResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setLoading(true)
    try {
      const result = await parseExcelFile(f)
      const sheetName = result.sheets[0]
      const rows = result.data[sheetName] ?? []
      setParsed({ sheetNames: result.sheets, rows, columns: Object.keys(rows[0] ?? {}) })
      setSelectedSheet(sheetName)
      setStep(2)
    } catch (err) {
      toast.error('Nie można odczytać pliku Excel')
    } finally {
      setLoading(false)
    }
  }

  const handleSheetConfirm = async () => {
    if (!file || !selectedSheet) return
    setLoading(true)
    try {
      const result = await parseExcelFile(file)
      const rows = result.data[selectedSheet] ?? []
      const cols = Object.keys(rows[0] ?? {})
      setParsed({ sheetNames: result.sheets, rows, columns: cols })
      const suggestions = importType === 'trips' ? TRIP_COLUMN_SUGGESTIONS : CLIENT_COLUMN_SUGGESTIONS
      const autoMap = autoDetectMapping(cols, suggestions)
      setMapping(autoMap)
      setPreview(rows.slice(0, 5))
      setStep(3)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!parsed) return
    setLoading(true)
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          import_type: importType,
          rows: parsed.rows,
          column_mapping: mapping
        })
      })
      const data = await res.json()
      setImportResult(data)
      setStep(5)
    } catch {
      toast.error('Błąd importu')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep(1)
    setFile(null)
    setParsed(null)
    setSelectedSheet('')
    setMapping({})
    setPreview([])
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const suggestions = importType === 'trips' ? TRIP_COLUMN_SUGGESTIONS : CLIENT_COLUMN_SUGGESTIONS

  return (
    <div>
      <Header title="Import danych" />
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {(['Plik', 'Arkusz', 'Mapowanie', 'Podgląd', 'Wynik'] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${step >= i + 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i + 1}
              </div>
              <span className={`text-sm hidden sm:inline ${step === i + 1 ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{label}</span>
              {i < 4 && <ChevronRight size={14} className="text-gray-300" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-lg font-semibold mb-4">Wybierz plik Excel</h2>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-primary-400 transition-colors">
              <Upload size={36} className="text-gray-300 mb-3" />
              <p className="text-gray-600 font-medium">Kliknij aby wybrać plik .xlsx lub .xls</p>
              <p className="text-gray-400 text-sm mt-1">lub przeciągnij plik tutaj</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            </label>
            {loading && <div className="mt-4 flex justify-center"><Spinner /></div>}
          </div>
        )}

        {/* Step 2: Sheet & Type */}
        {step === 2 && parsed && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Wybierz arkusz i typ importu</h2>
            <Select
              label="Arkusz"
              value={selectedSheet}
              onChange={e => setSelectedSheet(e.target.value)}
              options={parsed.sheetNames.map(s => ({ value: s, label: s }))}
            />
            <Select
              label="Typ importu"
              value={importType}
              onChange={e => setImportType(e.target.value as ImportType)}
              options={[
                { value: 'trips', label: 'Przejazdy' },
                { value: 'clients', label: 'Klienci' }
              ]}
            />
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={reset}>Wróć</Button>
              <Button onClick={handleSheetConfirm} loading={loading}>Dalej</Button>
            </div>
          </div>
        )}

        {/* Step 3: Column mapping */}
        {step === 3 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Mapowanie kolumn</h2>
            <p className="text-sm text-gray-500">Dopasuj kolumny z pliku do pól aplikacji.</p>
            <div className="space-y-3">
              {Object.entries(suggestions).map(([field, hint]) => (
                <div key={field} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 w-40 shrink-0">{field}</span>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">— pomiń —</option>
                    {parsed?.columns.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>Wróć</Button>
              <Button onClick={() => setStep(4)}>Podgląd</Button>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {step === 4 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Podgląd danych (pierwsze 5 wierszy)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {parsed?.columns.map(c => (
                      <th key={c} className="px-3 py-2 text-left text-gray-600">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {parsed?.columns.map(c => (
                        <td key={c} className="px-3 py-2 text-gray-700">{String(row[c] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-gray-500">Łącznie wierszy do importu: {parsed?.rows.length ?? 0}</p>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(3)}>Wróć</Button>
              <Button onClick={handleImport} loading={loading}>Importuj</Button>
            </div>
          </div>
        )}

        {/* Step 5: Result */}
        {step === 5 && importResult && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Wynik importu</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-xl p-4 text-center border border-green-200">
                <p className="text-3xl font-bold text-green-600">{importResult.imported}</p>
                <p className="text-sm text-green-700 mt-1">Zaimportowano</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4 text-center border border-red-200">
                <p className="text-3xl font-bold text-red-600">{importResult.failed}</p>
                <p className="text-sm text-red-700 mt-1">Błędy</p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <Alert variant="warning" title="Błędy importu">
                <ul className="list-disc list-inside space-y-1 text-sm mt-1">
                  {importResult.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                  {importResult.errors.length > 20 && (
                    <li>…i {importResult.errors.length - 20} więcej</li>
                  )}
                </ul>
              </Alert>
            )}
            {importResult.imported > 0 && (
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <CheckCircle size={18} />
                Import zakończony pomyślnie
              </div>
            )}
            <Button onClick={reset}>Importuj kolejny plik</Button>
          </div>
        )}
      </div>
    </div>
  )
}
