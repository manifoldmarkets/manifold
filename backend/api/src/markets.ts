import { SupabaseClient, createSupabaseClient } from 'shared/supabase/init'
import { run, selectJson } from 'common/supabase/utils'
import { toLiteMarket } from 'common/api/market-types'
import { typedEndpoint } from './helpers'

// mqp: this pagination approach is technically incorrect if multiple contracts
// have the exact same createdTime, but that's very unlikely
const getBeforeTime = async (
  db: SupabaseClient,
  beforeId: string | undefined
) => {
  if (beforeId) {
    const createdTime = await getCreatedTime(db, beforeId)
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
  return data && data.length > 0 ? data[0].created_time : null
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

export const markets = typedEndpoint(
  'markets',
  async ({ limit, userId, before }) => {
    const db = createSupabaseClient()
    const beforeTime = await getBeforeTime(db, before)
    const contracts = await getPublicContracts(db, {
      beforeTime,
      limit,
      userId,
    })

    return contracts.map(toLiteMarket)
  }
)
