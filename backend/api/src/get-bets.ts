import { run, tsToMillis, type SupabaseClient } from 'common/supabase/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getContractIdFromSlug } from 'shared/supabase/contracts'
import { getUserIdFromUsername } from 'shared/supabase/users'
import { getBetsWithFilter } from 'shared/supabase/bets'

export const getBets: APIHandler<'bets'> = async (props) => {
  const {
    limit,
    username,
    contractSlug,
    answerId,
    before,
    after,
    beforeTime,
    afterTime,
    order,
    kinds,
    filterRedemptions,
    includeZeroShareRedemptions,
  } = props
  if (limit === 0) {
    return []
  }
  const db = createSupabaseClient()

  const userId = props.userId ?? (await getUserIdFromUsername(db, username))
  const contractId =
    props.contractId ?? (await getContractIdFromSlug(db, contractSlug))

  // mqp: this pagination approach is technically incorrect if multiple bets
  // have the exact same createdTime, but that's very unlikely
  const beforeBetTime =
    before === undefined
      ? undefined
      : await getBetTime(db, before).catch(() => {
          throw new APIError(404, 'Bet specified in before parameter not found')
        })

  const afterBetTime = !after
    ? undefined
    : await getBetTime(db, after).catch(() => {
        throw new APIError(404, 'Bet specified in after parameter not found')
      })

  const opts = {
    userId,
    contractId,
    answerId,
    beforeTime:
      beforeTime !== undefined && beforeBetTime !== undefined
        ? Math.min(beforeTime, beforeBetTime)
        : beforeTime ?? beforeBetTime,
    afterTime:
      afterTime && afterBetTime
        ? Math.max(afterTime, afterBetTime)
        : afterTime ?? afterBetTime,
    limit,
    order,
    kinds,
    filterRedemptions,
    includeZeroShareRedemptions,
  }

  const pg = createSupabaseDirectClient()
  return await getBetsWithFilter(pg, opts)
}

async function getBetTime(db: SupabaseClient, id: string) {
  const { data } = await run(
    db.from('contract_bets').select('created_time').eq('bet_id', id).single()
  )
  return tsToMillis(data.created_time)
}
