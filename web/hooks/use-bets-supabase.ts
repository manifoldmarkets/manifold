import { Bet, BetFilter } from 'common/bet'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { EMPTY_USER } from 'web/components/contract/contract-tabs'
import { getBets, getTotalBetCount } from 'common/supabase/bets'

function getFilteredQuery(filteredParam: string, filterId?: string) {
  if (filteredParam === 'contractId' && filterId) {
    return `contract_id=eq.${filterId}`
  }
  return undefined
}

export function useRealtimeBets(options?: BetFilter, printUser?: boolean) {
  const [bets, setBets] = useState<Bet[]>([])
  let filteredParam
  let filteredQuery: string | undefined
  if (options) {
    if (options.contractId) {
      filteredParam = 'contractId'
      filteredQuery = getFilteredQuery(filteredParam, options.contractId)
    }
  }

  useEffectCheckEquality(() => {
    if (options?.userId === 'loading' || options?.userId === EMPTY_USER) {
      return
    }
    getBets(db, {
      ...options,
      order: 'desc',
    })
      .then((result) => {
        setBets(result)
      })
      .catch((e) => console.log(e))

    const channel = db.channel(
      `live-bets-${
        options?.contractId ? '-contract-' + options?.contractId + '-' : ''
      }${options?.userId ? '-user-' + options?.userId + '-' : ''}`
    )

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
                return [payloadBet].concat(bets)
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
      if (channel) {
        db.removeChannel(channel)
      }
    }
  }, [options, db])

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
