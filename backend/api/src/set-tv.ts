import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { z } from 'zod'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getContractIdFromSlug } from 'shared/supabase/contracts'
import { isAdminId, isModId } from 'common/envs/constants'

const schema = z
  .object({
    slug: z.string(),
    streamId: z.string(),
    source: z.string(),
  })
  .optional()

export const settv = authEndpoint(async (req, auth, log) => {
  const isMod = isAdminId(auth.uid) || isModId(auth.uid)
  if (!isMod) {
    throw new APIError(403, 'You are not authorized to set tv settings')
  }

  const tvSettings = validate(schema, req.body)

  const pg = createSupabaseDirectClient()

  if (!tvSettings) {
    await pg.none('delete from tv_schedule where id = 1')
    return { status: 'success' }
  }

  const { slug, streamId, source } = tvSettings
  const processedStreamId = streamId.trim().substring(0, 11)

  const db = createSupabaseClient()
  const contractId = await getContractIdFromSlug(db, slug)

  await pg.none(
    'update tv_schedule set contract_id = $1, stream_id = $2, source = $3 where id = 1',
    [contractId, processedStreamId, source]
  )

  return { status: 'success' }
})
