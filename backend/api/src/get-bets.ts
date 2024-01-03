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
  const { limit, username, contractSlug, before, after, order, kinds } = props

  const db = createSupabaseClient()

  const userId = props.userId ?? (await getUserIdFromUsername(db, username))
  const contractId =
    props.contractId ?? (await getContractIdFromSlug(db, contractSlug))

  // mqp: this pagination approach is technically incorrect if multiple bets
  // have the exact same createdTime, but that's very unlikely
  const beforeTime = !before
    ? undefined
    : await getBetTime(db, before).catch(() => {
        throw new APIError(404, 'Bet specified in before parameter not found')
      })

  const afterTime = !after
    ? undefined
    : await getBetTime(db, after).catch(() => {
        throw new APIError(404, 'Bet specified in after parameter not found')
      })

  const opts: BetFilter = {
    userId,
    contractId,
    beforeTime,
    afterTime,
    limit,
    order,
    isOpenLimitOrder: kinds === 'open-limit',
  }

  const bets = contractId
    ? await getBetsSupabase(db, opts)
    : await getPublicBets(db, opts)

  return bets
}
