import { z } from 'zod'

import { isAdminId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers'
import { createSupabaseClient } from 'shared/supabase/init'

const schema = z
  .object({
    dashboardId: z.string(),
  })
  .strict()

export const deletedashboard = authEndpoint(async (req, auth) => {
  const { dashboardId } = validate(schema, req.body)

  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'You are not an admin')
  }

  const db = createSupabaseClient()

  const { error } = await db
    .from('dashboards')
    .update({ visibility: 'deleted' })
    .eq('id', dashboardId)

  if (error) {
    throw new APIError(500, 'Failed to delete dashboard' + error.message)
  }

  return { status: 'success' }
})
