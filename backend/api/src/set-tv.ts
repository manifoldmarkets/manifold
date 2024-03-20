import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { z } from 'zod'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getContractIdFromSlug } from 'shared/supabase/contracts'
import { isAdminId, isModId } from 'common/envs/constants'

const schema = z.object({
  id: z.string().optional(),
  slug: z.string(),
  streamId: z.string().length(11),
  source: z.string(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
})

export const settv = authEndpoint(async (req, auth) => {
  const tvSettings = validate(schema, req.body)

  const pg = createSupabaseDirectClient()

  const isMod = isAdminId(auth.uid) || isModId(auth.uid)

  const { id, slug, streamId, source, title, startTime, endTime } = tvSettings
  const processedStreamId = streamId.trim().substring(0, 11)

  const db = createSupabaseClient()
  const contractId = await getContractIdFromSlug(db, slug)

  if (id) {
    await pg.none(
      'UPDATE tv_schedule SET contract_id = $1, stream_id = $2, source = $3, title = $4, start_time = $5, end_time = $6 WHERE id = $7',
      [contractId, processedStreamId, source, title, startTime, endTime, id]
    )
    return { status: 'success' }
  }

  await pg.none(
    'INSERT INTO tv_schedule (creator_id, contract_id, stream_id, source, title, start_time, end_time) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [auth.uid, contractId, processedStreamId, source, title, startTime, endTime]
  )

  return { status: 'success' }
})

const deleteSchema = z.object({
  id: z.string(),
})

export const deletetv = authEndpoint(async (req, auth) => {
  const { id } = validate(deleteSchema, req.body)

  const pg = createSupabaseDirectClient()
  await pg.none('delete from tv_schedule where id = $1', [id])
  return { status: 'success' }
})
