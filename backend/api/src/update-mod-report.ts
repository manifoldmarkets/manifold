import { ModReport } from 'common/mod-report'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { removeUndefinedProps } from 'common/util/object'
import { update } from 'shared/supabase/utils'

export const updateModReport: APIHandler<'update-mod-report'> = async (
  props
) => {
  const { reportId, updates } = props
  const pg = createSupabaseDirectClient()

  const data = await update(pg, 'mod_reports', 'report_id', {
    report_id: reportId,
    ...removeUndefinedProps(updates),
  })

  if (!data) {
    console.error('Report not found for ID:', reportId)
    throw new APIError(404, 'Report not found')
  }

  return { status: 'success', report: data as ModReport }
}
