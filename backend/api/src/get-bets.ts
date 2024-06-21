import { BetFilter } from 'common/bet'
import { getBets as getBetsSupabase, getPublicBets } from 'common/supabase/bets'
import { run, tsToMillis, type SupabaseClient } from 'common/supabase/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { getContractIdFromSlug } from 'shared/supabase/contracts'
import { getUserIdFromUsername } from 'shared/supabase/users'

async function getBetTime(db: SupabaseClient, id: string) {
  const { data } = await run(
    db.from('contract_bets').select('created_time').eq('bet_id', id).single()
  )
  return tsToMillis(data.created_time)
}

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
    filterAntes,
    filterChallenges,
    filterRedemptions,
  } = props

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

  const opts: BetFilter = {
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
    isOpenLimitOrder: kinds === 'open-limit',
    filterAntes,
    filterChallenges,
    filterRedemptions,
  }

  const bets = contractId
    ? await getBetsSupabase(db, opts)
    : await getPublicBets(db, opts)

  return bets
}
