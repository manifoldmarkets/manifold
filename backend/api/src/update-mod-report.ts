import { ModReport } from 'common/mod-report'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'

export const updateModReport: APIHandler<'update-mod-report'> = async (
  props
) => {
  const { reportId, updates } = props
  const db = createSupabaseClient()

  const updateData: {
    status?: 'new' | 'under review' | 'resolved' | 'needs admin'
    mod_note?: string
  } = {}

  if (updates.status) {
    updateData.status = updates.status
  }
  if (updates.mod_note !== undefined) {
    updateData.mod_note = updates.mod_note
  }

  const { data, error } = await db
    .from('mod_reports')
    .update(updateData)
    .eq('report_id', reportId)

  if (error) {
    throw new APIError(500, 'Error updating report', { error })
  }
  if (!data) {
    throw new APIError(404, 'Report not found')
  }

  return { status: 'success', report: data as ModReport }
}
