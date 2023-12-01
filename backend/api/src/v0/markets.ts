import { z } from 'zod'
import { SupabaseClient, createSupabaseClient } from 'shared/supabase/init'
import { millisToTs, run, selectJson } from 'common/supabase/utils'
import { toLiteMarket } from 'common/api-market-types'
import { validate, MaybeAuthedEndpoint } from '../helpers'

const queryParams = z
  .object({
    limit: z
      .number()
      .default(500)
      .or(z.string().regex(/\d+/).transform(Number))
      .refine((n) => n >= 0 && n <= 1000, 'Limit must be between 0 and 1000'),
    before: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict()

// mqp: this pagination approach is technically incorrect if multiple contracts
// have the exact same createdTime, but that's very unlikely
const getBeforeTime = async (
  db: SupabaseClient,
  params: z.infer<typeof queryParams>
) => {
  if (params.before) {
    const createdTime = await getCreatedTime(db, params.before)
    if (createdTime == null) {
      throw new Error('Contract specified in before parameter not found.')
    }
    return createdTime
  } else {
    return undefined
  }
}

const getCreatedTime = async (db: SupabaseClient, id: string) => {
  const { data } = await run(
    db.from('public_contracts').select('created_time').eq('id', id)
  )
  return data && data.length > 0 ? (data[0].created_time) : null
}

// Only fetches contracts with 'public' visibility
const getPublicContracts = async (
  db: SupabaseClient,
  options: {
    limit: number
    beforeTime?: string
    order?: 'asc' | 'desc'
    userId?: string
  }
) => {
  let q = selectJson(db, 'public_contracts')
  q = q.order('created_time', {
    ascending: options?.order === 'asc',
  } as any)
  if (options.beforeTime) {
    q = q.lt('created_time', options.beforeTime)
  }
  if (options?.userId) {
    q = q.eq('user_id', options.userId)
  }
  q = q.limit(options.limit)
  const { data } = await run(q)
  return data.map((r) => r.data)
}

export const markets = MaybeAuthedEndpoint(async (req, _auth, _log, _logError, res) => {
  let params = validate(queryParams, req.query)
  const { limit, userId } = params
  const db = createSupabaseClient()
  const beforeTime = await getBeforeTime(db, params)
  const contracts = await getPublicContracts(db, { beforeTime, limit, userId })
  // Serve from cache, then update. see https://cloud.google.com/cdn/docs/caching
  res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=45')
  return contracts.map(toLiteMarket)
})
