import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'

export const updateReportStatus: APIHandler<'update-report-status'> = async (
  props
) => {
  const { reportId, newStatus } = props
  const db = createSupabaseClient()

  const { data, error } = await db
    .from('mod_reports')
    .update({ status: newStatus })
    .eq('report_id', reportId)

  if (error) {
    throw new APIError(500, 'Error updating report status', { error })
  }

  return { status: 'success', data }
}
