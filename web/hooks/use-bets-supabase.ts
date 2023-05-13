import { Bet, BetFilter } from 'common/bet'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { EMPTY_USER } from 'web/components/contract/contract-tabs'
import { getBets, getTotalBetCount } from 'common/supabase/bets'
import { Filter } from 'common/supabase/realtime'
import { useLiveStream } from 'web/lib/supabase/realtime/use-live-stream'

function getFilteredQuery(filteredParam: string, filterId?: string) {
  if (filteredParam === 'contractId' && filterId) {
    return { k: 'contract_id', v: filterId } as const
  }
  return undefined
}

export function useRealtimeBets(options?: BetFilter, printUser?: boolean) {
  let filteredParam
  let filteredQuery: Filter<'contract_bets'> | undefined
  if (options) {
    if (options.contractId) {
      filteredParam = 'contractId'
      filteredQuery = getFilteredQuery(filteredParam, options.contractId)
    }
  }
  const [oldBets, setOldBets] = useState<Bet[]>([])
  const stream = useLiveStream('contract_bets', filteredQuery)
  const newBets = stream
    .map(r => r.data as Bet)
    .filter(b => !betShouldBeFiltered(b, options))

  useEffectCheckEquality(() => {
    if (options?.userId === 'loading' || options?.userId === EMPTY_USER) {
      return
    }
    getBets(db, { ...options, order: 'desc' })
      .then((result) => setOldBets(result))
      .catch((e) => console.log(e))
  }, [options, db])

  return [...oldBets, ...newBets]
}

function betShouldBeFiltered(bet: Bet, options?: BetFilter) {
  if (!options) {
    return false
  }
  const shouldBeFiltered =
    // if contract filter exists, and bet doesn't match contract
    (options.contractId && bet.contractId != options.contractId) ||
    // if user filter exists, and bet doesn't match user
    (options.userId && bet.userId != options.userId) ||
    // if afterTime filter exists, and bet is before that time
    (options.afterTime && bet.createdTime <= options.afterTime) ||
    // if beforeTime filter exists, and bet is after that time
    (options.beforeTime && bet.createdTime >= options.beforeTime) ||
    // if challenges filter is true, and bet is a challenge
    (options.filterChallenges && bet.isChallenge) ||
    // if ante filter is true, and bet is ante
    (options.filterAntes && bet.isAnte) ||
    // if redemption filter is true, and bet is redemption
    (options.filterRedemptions && bet.isRedemption) ||
    // if isOpenlimitOrder filter exists, and bet is not filled/cancelled
    (options.isOpenLimitOrder && (bet.isFilled || bet.isCancelled))
  return shouldBeFiltered
}

export function useBets(options?: BetFilter) {
  const [bets, setBets] = useState<Bet[] | undefined>()

  useEffectCheckEquality(() => {
    getBets(db, options).then((result) => setBets(result))
  }, [options])

  return bets
}

export function useBetCount(contractId: string) {
  const [betCount, setBetCount] = useState<number>(0)

  useEffect(() => {
    if (contractId) {
      getTotalBetCount(contractId, db).then((result) => setBetCount(result))
    }
  }, [contractId])

  return betCount
}
