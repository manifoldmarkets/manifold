import { Bet, BetFilter } from 'common/bet'
import { db } from 'web/lib/supabase/db'
import { useEvent } from 'web/hooks/use-event'
import { useEffectCheckEquality } from './use-effect-check-equality'
import {
  applyBetsFilter,
  convertBet,
  getBetRows,
  getBets,
} from 'common/supabase/bets'
import { Filter } from 'common/supabase/realtime'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { maxBy, orderBy } from 'lodash'
import { Row, tsToMillis } from 'common/supabase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'

function getFilteredQuery(filteredParam: string, filterId?: string) {
  if (filteredParam === 'contractId' && filterId) {
    return { k: 'contract_id', v: filterId } as const
  }
  return undefined
}

export function useRealtimeBets(options?: BetFilter) {
  let filteredParam
  let filteredQuery: Filter<'contract_bets'> | undefined
  if (options?.contractId) {
    filteredParam = 'contractId'
    filteredQuery = getFilteredQuery(filteredParam, options.contractId)
  }
  const { rows, dispatch } = useSubscription(
    'contract_bets',
    filteredQuery,
    () => getBetRows(db, { ...options, order: options?.order ?? 'asc' })
  )

  const loadNewer = useEvent(async () => {
    const retryLoadNewer = async (attemptNumber: number) => {
      const newRows = await getBetRows(db, {
        ...options,
        afterTime: tsToMillis(
          maxBy(rows ?? [], (r) => tsToMillis(r.created_time))?.created_time ??
            new Date(Date.now() - 500).toISOString()
        ),
      })
      if (newRows.length) {
        for (const r of newRows) {
          // really is an upsert
          dispatch({ type: 'CHANGE', change: { eventType: 'INSERT', new: r } })
        }
      } else if (attemptNumber < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attemptNumber))
        retryLoadNewer(attemptNumber + 1)
      }
    }

    const maxAttempts = 10
    await retryLoadNewer(1)
  })

  const newBets = rows
    ?.map(convertBet)
    .filter((b) => !betShouldBeFiltered(b, options))

  return { rows: newBets, loadNewer }
}

export function betShouldBeFiltered(bet: Bet, options?: BetFilter) {
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
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `use-bets-${JSON.stringify(options)}`
  )

  useEffectCheckEquality(() => {
    getBets(db, options).then((result) => setBets(result))
  }, [options])

  return bets
}

export function useRealtimeBetsPolling(
  contractId: string,
  ms: number,
  options: BetFilter,
  initialLimit = 50
) {
  let allRowsQ = db.from('contract_bets').select('*')
  allRowsQ = allRowsQ.order('created_time', {
    ascending: options?.order === 'asc',
  })
  allRowsQ = applyBetsFilter(allRowsQ, options)

  const newRowsOnlyQ = (rows: Row<'contract_bets'>[] | undefined) => {
    // You can't use allRowsQ here because it keeps tacking on another gt clause
    const { afterTime, ...rest } = options
    const latestCreatedTime = maxBy(rows, 'created_time')?.created_time
    let q = db
      .from('contract_bets')
      .select('*')
      .gt(
        'created_time',
        latestCreatedTime ?? new Date(afterTime ?? 0).toISOString()
      )
    q = applyBetsFilter(q, rest)
    return q
  }

  const results = usePersistentSupabasePolling(
    'contract_bets',
    allRowsQ,
    newRowsOnlyQ,
    `contract-bets-${contractId}-${ms}ms-${initialLimit}limit-v1`,
    {
      ms,
      deps: [contractId],
      shouldUseLocalStorage: false,
    }
  )
  return results
    ? orderBy(results.map(convertBet), 'createdTime', 'desc')
    : undefined
}
