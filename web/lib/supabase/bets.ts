import { db } from './db'
import { run, selectJson } from 'common/supabase/utils'
import { BetFilter } from 'web/lib/firebase/bets'
import { Contract } from 'common/contract'
import { Dictionary, flatMap } from 'lodash'
import { LimitBet } from 'common/bet'
import { useCallback, useEffect, useState } from 'react'
import { getUserContractMetricsWithContracts } from 'common/supabase/contract-metrics'

export async function getOlderBets(
  contractId: string,
  beforeTime: number,
  limit: number
) {
  const query = selectJson(db, 'contract_bets')
    .eq('contract_id', contractId)
    .lt('data->>createdTime', beforeTime)
    .order('data->>createdTime', { ascending: false } as any)
    .limit(limit)
  const { data } = await run(query)

  return data.map((r) => r.data)
}

export const getBets = async (options?: BetFilter) => {
  const query = getBetsQuery(options)
  const { data } = await run(query)
  return data.map((r) => r.data)
}

export const getBetsQuery = (options?: BetFilter) => {
  let q = selectJson(db, 'contract_bets').order('data->>createdTime', {
    ascending: options?.order === 'asc',
  } as any)

  if (options?.contractId) {
    q = q.eq('contract_id', options.contractId)
  }
  if (options?.userId) {
    q = q.eq('data->>userId', options.userId)
  }
  if (options?.afterTime) {
    q = q.gt('data->>createdTime', options.afterTime)
  }
  if (options?.filterChallenges) {
    q = q.eq('data->isChallenge', false)
  }
  if (options?.filterAntes) {
    q = q.eq('data->isAnte', false)
  }
  if (options?.filterRedemptions) {
    q = q.eq('data->isRedemption', false)
  }
  if (options?.isOpenLimitOrder) {
    q = q.eq('data->isFilled', false)
    q = q.eq('data->isCancelled', false)
  }
  if (options?.limit) {
    q = q.limit(options.limit)
  }
  return q
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
  }, [userId])
  useEffect(() => {
    // Don't fire multiple times on load so that we lose the proper count
    const timeout = setTimeout(loadMore, 1000)
    return () => clearTimeout(timeout)
  }, [loadMore])

  return { contracts: savedContracts, loadMore }
}
