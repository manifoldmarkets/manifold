import { ModReport } from 'common/mod-report'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'

export const updateModReport: APIHandler<'update-mod-report'> = async (
  props
) => {
  const { reportId, updates } = props
  const db = createSupabaseClient()

  console.log('Updating report with ID:', reportId)
  console.log('Updates:', updates)

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
    .select()

  if (error) {
    console.error('Error updating report:', error)
    throw new APIError(500, 'Error updating report', { error })
  }
  if (!data || data.length === 0) {
    console.error('Report not found for ID:', reportId)
    throw new APIError(404, 'Report not found')
  }

  console.log('Report updated successfully:', data[0])
  return { status: 'success', report: data[0] as ModReport }
}
