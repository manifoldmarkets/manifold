import { Bet } from 'common/bet'
import { useEffect, useState } from 'react'
import { BetFilter } from 'web/lib/firebase/bets'
import { getBets, getTotalBetCount } from 'web/lib/supabase/bets'
import { db } from 'web/lib/supabase/db'

function getFilteredQuery(filteredParam: string, filterId?: string) {
  if (filteredParam === 'contractId' && filterId) {
    return `contract_id=eq.${filterId}`
  }
  return undefined
}

export function useRealtimeBets(options?: BetFilter) {
  const [bets, setBets] = useState<Bet[]>([])
  let filteredParam
  let filteredQuery: string | undefined
  if (options) {
    if (options.contractId) {
      filteredParam = 'contractId'
      filteredQuery = getFilteredQuery(filteredParam, options.contractId)
    }
  }

  useEffect(() => {
    getBets({ order: 'desc', ...options })
      .then((result) => setBets(result))
      .catch((e) => console.log(e))
  }, [])

  useEffect(() => {
    const channel = db.channel(`live-bets-${options?.contractId ?? 'all'}`)
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'contract_bets',
        filter: filteredQuery,
      },
      (payload) => {
        if (payload) {
          const payloadBet = payload.new.data as Bet
          if (!betShouldBeFiltered(payloadBet, options)) {
            setBets((bets) => {
              if (payloadBet && !bets.some((c) => c.id == payloadBet.id)) {
                return [payloadBet].concat(bets.slice(0, -1))
              } else {
                return bets
              }
            })
          }
        }
      }
    )
    channel.subscribe(async (status) => {})
    return () => {
      db.removeChannel(channel)
    }
  }, [db])
  return bets
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
  const [bets, setBets] = useState<Bet[]>([])

  useEffect(() => {
    getBets(options).then((result) => setBets(result))
  }, [])

  return bets
}

export function useBetCount(contractId: string) {
  const [betCount, setBetCount] = useState<number>(0)

  useEffect(() => {
    if (contractId) {
      getTotalBetCount(contractId).then((result) => setBetCount(result))
    }
  }, [contractId])

  return betCount
}
