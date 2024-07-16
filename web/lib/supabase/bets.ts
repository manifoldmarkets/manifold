import { db } from './db'
import { Contract } from 'common/contract'
import { Dictionary, flatMap } from 'lodash'
import { LimitBet } from 'common/bet'
import { useCallback, useEffect, useState } from 'react'
import { getUserContractMetricsWithContracts } from 'common/supabase/contract-metrics'

export const getOpenLimitOrdersWithContracts = async (
  userId: string,
  count = 1000,
  isPolitics?: boolean
) => {
  const { data } = await db.rpc('get_open_limit_bets_with_contracts_1', {
    count,
    uid: userId,
    politics: !!isPolitics,
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

  return flatMap(data).map((d) => {
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
    return contracts.length > 0
  }, [userId])
  useEffect(() => {
    // Don't fire multiple times on load so that we lose the proper count
    const timeout = setTimeout(loadMore, 1000)
    return () => clearTimeout(timeout)
  }, [loadMore])

  return { contracts: savedContracts, loadMore }
}
