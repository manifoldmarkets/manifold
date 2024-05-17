// backend/get-reports.ts
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { Report as ReportSchema } from 'common/api/zod-types'
import { Report } from 'common/api/report-types'

export const getReports: APIHandler<'get-reports'> = async () => {
  const db = createSupabaseClient()

  const { data, error } = await db.from('mod_reports').select('*')

  if (error) {
    throw new APIError(500, `Failed to fetch reports: ${error.message}`)
  }

  // Validate data against Report schema
  const reports = ReportSchema.array().parse(data)

  return { status: 'success', data: reports as Report[] }
}
