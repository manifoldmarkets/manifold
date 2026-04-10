import { DAY_MS, HOUR_MS, WEEK_MS } from 'common/util/time'
import { getRecentContractLikes } from 'shared/supabase/likes'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateContractNativeColumns } from 'shared/supabase/contracts'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import {
  computeContractScores,
  getContractTraders,
  getContractVoters,
  getTodayComments,
} from 'shared/importance-score'
import { getContract } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

export const removeBoost: APIHandler<'remove-boost'> = async (props, auth) => {
  const { contractId } = props
  throwErrorIfNotAdmin(auth.uid)

  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)

  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  const removedBoosts = await pg.manyOrNone<{ id: number }>(
    `update contract_boosts
     set end_time = now()
     where contract_id = $1
       and funded
       and start_time <= now()
       and end_time > now()
     returning id`,
    [contractId]
  )

  if (removedBoosts.length === 0) {
    throw new APIError(404, 'No active boost found for this market')
  }

  const now = Date.now()
  const dayAgo = now - DAY_MS
  const hourAgo = now - HOUR_MS
  const weekAgo = now - WEEK_MS
  const contractIds = [contractId]

  const [
    todayComments,
    todayLikesByContract,
    thisWeekLikesByContract,
    todayContractTraders,
    todayContractVoters,
    hourAgoContractTraders,
    hourAgoContractVoters,
    thisWeekContractTraders,
    thisWeekContractVoters,
  ] = await Promise.all([
    getTodayComments(pg),
    getRecentContractLikes(pg, dayAgo),
    getRecentContractLikes(pg, weekAgo),
    getContractTraders(pg, dayAgo, contractIds),
    getContractVoters(pg, dayAgo, contractIds),
    getContractTraders(pg, hourAgo, contractIds),
    getContractVoters(pg, hourAgo, contractIds),
    getContractTraders(pg, weekAgo, contractIds),
    getContractVoters(pg, weekAgo, contractIds),
  ])

  const todayTradersByContract = {
    ...todayContractTraders,
    ...todayContractVoters,
  }
  const hourAgoTradersByContract = {
    ...hourAgoContractTraders,
    ...hourAgoContractVoters,
  }
  const thisWeekTradersByContract = {
    ...thisWeekContractTraders,
    ...thisWeekContractVoters,
  }

  const { importanceScore, freshnessScore, dailyScore } = computeContractScores(
    now,
    contract,
    todayComments[contractId] ?? 0,
    todayLikesByContract[contractId] ?? 0,
    thisWeekLikesByContract[contractId] ?? 0,
    todayTradersByContract[contractId] ?? 0,
    hourAgoTradersByContract[contractId] ?? 0,
    thisWeekTradersByContract[contractId] ?? 0,
    false
  )

  await updateContractNativeColumns(pg, contractId, {
    boosted: false,
    importance_score: importanceScore,
    freshness_score: freshnessScore,
    daily_score: dailyScore,
  })

  return { success: true }
}
