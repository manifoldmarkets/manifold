import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { getUser } from 'shared/utils'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z
  .object({
    id: z.number(),
  })
  .strict()

export const deletechartannotation = authEndpoint(async (req, auth, log) => {
  const { id } = validate(bodySchema, req.body)

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(404, 'Your account was not found')

  const pg = createSupabaseDirectClient()
  const res = await pg.one(
    `select creator_id from chart_annotations where id = $1`,
    [id]
  )
  if (res.creator_id !== auth.uid) await throwErrorIfNotMod(auth.uid)
  await pg.none(`delete from chart_annotations where id = $1`, [id])

  return { success: true, id }
})
