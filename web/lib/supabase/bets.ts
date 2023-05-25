import { db } from './db'
import { millisToTs, run, selectFrom, selectJson } from 'common/supabase/utils'
import { Bet, BetFilter } from 'common/bet'
import { Contract } from 'common/contract'
import { Dictionary, flatMap } from 'lodash'
import { LimitBet } from 'common/bet'
import { useCallback, useEffect, useState } from 'react'
import { getUserContractMetricsWithContracts } from 'common/supabase/contract-metrics'
import { applyBetsFilter } from 'common/supabase/bets'

export async function getOlderBets(
  contractId: string,
  beforeTime: number,
  limit: number
) {
  const query = selectJson(db, 'contract_bets')
    .eq('contract_id', contractId)
    .lt('created_time', millisToTs(beforeTime))
    .order('created_time', { ascending: false })
    .limit(limit)
  const { data } = await run(query)

  return data.map((r) => r.data)
}

export const getBet = async (id: string) => {
  const q = selectJson(db, 'contract_bets').eq('bet_id', id)
  const { data } = await run(q)
  return data.length > 0 ? data[0].data : null
}

export const getPublicBets = async (options?: BetFilter) => {
  let q = selectJson(db, 'public_contract_bets')
  q = q.order('created_time', { ascending: options?.order === 'asc' })
  q = applyBetsFilter(q, options)
  const { data } = await run(q)
  return data.map((r) => r.data)
}

export const getBetsOnContracts = async (
  contractIds: string[],
  options?: BetFilter
) => {
  let q = selectJson(db, 'contract_bets')
  q = q.in('contract_id', contractIds)
  q = q.order('created_time', { ascending: options?.order === 'asc' })
  q = applyBetsFilter(q, options)
  const { data } = await run(q)
  return data.map((r) => r.data)
}

export const getBetFields = async <T extends (keyof Bet)[]>(
  fields: T,
  options?: BetFilter
) => {
  let q = selectFrom(db, 'contract_bets', ...fields)
  q = q.order('created_time', { ascending: options?.order === 'asc' })
  q = applyBetsFilter(q, options)
  const { data } = await run(q)
  return data
}

export const getOpenLimitOrdersWithContracts = async (
  userId: string,
  count = 1000
) => {
  const { data } = await db.rpc('get_open_limit_bets_with_contracts', {
    count,
    uid: userId,
  })
  const betsByContract = {} as Dictionary<LimitBet[]>

  const contracts = [] as Contract[]
  flatMap(data).forEach((d) => {
    betsByContract[d.contract_id] = d.bets as LimitBet[]
    contracts.push(d.contract as Contract)
  })
  return { betsByContract, contracts }
}

export const getUserBetsFromResolvedContracts = async (
  userId: string,
  count = 1000
) => {
  const { data } = await db.rpc('get_user_bets_from_resolved_contracts', {
    count,
    start: 0,
    uid: userId,
  })

  return flatMap(data).map((d: any) => {
    return [d.contract, d.bets]
  }) as [Contract, LimitBet[]][]
}

export const sampleResolvedBets = async (trader_threshold: number, p: number) => {
  const  {data}  = await db.rpc('sample_resolved_bets' as any, {
    trader_threshold,
    p,
  })

  return data
}

export const useRecentlyBetOnContracts = (userId: string) => {
  const [savedContracts, setSavedContracts] = useState<Contract[]>()

  const loadMore = useCallback(async () => {
    const { contracts } = await getUserContractMetricsWithContracts(
      userId,
      db,
      10,
      savedContracts?.length ?? 0
    )
    setSavedContracts((prev) => (prev ? [...prev, ...contracts] : contracts))
    return contracts.length > 0
  }, [userId])
  useEffect(() => {
    // Don't fire multiple times on load so that we lose the proper count
    const timeout = setTimeout(loadMore, 1000)
    return () => clearTimeout(timeout)
  }, [loadMore])

  return { contracts: savedContracts, loadMore }
}
