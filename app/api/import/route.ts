import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapExcelRowToClient, mapExcelRowToTrip } from '@/lib/utils/excel'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { import_type, rows, mapping, vehicle_id, driver_id } = body

  if (!import_type || !rows || !mapping) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const errors: { row: number; field: string; message: string }[] = []
  let importedCount = 0
  let failedCount = 0

  // Create import log
  const { data: importLog } = await supabase
    .from('imports')
    .insert({
      file_name: body.file_name ?? 'import.xlsx',
      import_type,
      status: 'processing',
      rows_total: rows.length,
      rows_imported: 0,
      rows_failed: 0,
      created_by: user.id
    })
    .select()
    .single()

  if (import_type === 'clients') {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const clientData = mapExcelRowToClient(row, mapping)

      if (!clientData.name) {
        errors.push({ row: i + 1, field: 'name', message: 'Brak nazwy klienta' })
        failedCount++
        continue
      }

      const { error } = await supabase.from('clients').upsert(
        { ...clientData },
        { onConflict: 'name' }
      )

      if (error) {
        errors.push({ row: i + 1, field: 'general', message: error.message })
        failedCount++
      } else {
        importedCount++
      }
    }
  } else if (import_type === 'trips') {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const tripData = mapExcelRowToTrip(row, mapping)

      if (!tripData.date_from) {
        errors.push({ row: i + 1, field: 'date_from', message: 'Brak daty przejazdu' })
        failedCount++
        continue
      }

      // Resolve client by name/code
      let clientId: string | null = null
      const clientName = row[mapping.client_name]
      const clientCode = row[mapping.client_code]

      if (clientName) {
        const { data: client } = await supabase
          .from('clients')
          .select('id')
          .ilike('name', String(clientName).trim())
          .single()
        if (client) clientId = client.id
      } else if (clientCode) {
        const { data: client } = await supabase
          .from('clients')
          .select('id')
          .eq('code', String(clientCode).trim())
          .single()
        if (client) clientId = client.id
      }

      const { error } = await supabase.from('trips').insert({
        ...tripData,
        vehicle_id: vehicle_id ?? null,
        driver_id: driver_id ?? null,
        client_id: clientId,
        created_by: user.id
      })

      if (error) {
        errors.push({ row: i + 1, field: 'general', message: error.message })
        failedCount++
      } else {
        importedCount++
      }
    }
  }

  // Update import log
  if (importLog?.id) {
    await supabase
      .from('imports')
      .update({
        status: failedCount === rows.length ? 'failed' : 'completed',
        rows_imported: importedCount,
        rows_failed: failedCount,
        error_report: errors
      })
      .eq('id', importLog.id)
  }

  return NextResponse.json({
    data: {
      imported: importedCount,
      failed: failedCount,
      errors: errors.slice(0, 50) // Return first 50 errors
    }
  })
}
