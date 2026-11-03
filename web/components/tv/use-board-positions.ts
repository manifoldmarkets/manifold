import { useEffect, useMemo, useRef, useState } from 'react'

import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { run } from 'common/supabase/utils'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { BoardPosition, boardPositions } from './election-board-model'

const CHUNK = 100
// Metrics are written with the bet; a moment's grace before re-reading.
const AFTER_BET_MS = 1500

type Metrics = Record<string, ContractMetric[]>

async function fetchMetrics(userId: string, ids: string[]) {
  const out: Metrics = {}
  for (const id of ids) out[id] = []
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const { data } = await run(
      db
        .from('user_contract_metrics')
        .select('data')
        .eq('user_id', userId)
        .in('contract_id', ids.slice(offset, offset + CHUNK))
    )
    for (const row of data) {
      const metric = row.data as ContractMetric
      if (metric?.contractId) (out[metric.contractId] ??= []).push(metric)
    }
  }
  return out
}

// The signed-in account's positions on the board's markets: every market it
// has traded, by market (the whole-market summary) and by answer, valued at
// the live prices of `contracts`. The metrics are read once, re-read when the
// tab regains focus, and re-read per market when the account trades there:
// its own bets (the global bet stream) and fills of its resting orders (its
// orders topic; the filling bet belongs to the taker).
export function useBoardPositions(
  contracts: Contract[]
): Map<string, BoardPosition> {
  const user = useUser()
  const userId = user?.id
  const idsKey = JSON.stringify([...new Set(contracts.map((c) => c.id))].sort())
  const [state, setState] = useState<{
    userId: string | undefined
    metrics: Metrics
  }>({ userId, metrics: {} })
  const requests = useRef(0)

  const refresh = useEvent(async () => {
    const request = ++requests.current
    if (!userId) {
      setState({ userId, metrics: {} })
      return
    }
    try {
      const metrics = await fetchMetrics(userId, JSON.parse(idsKey))
      if (request === requests.current) setState({ userId, metrics })
    } catch (e) {
      console.error('Failed to load TV board positions', e)
    }
  })

  // Re-read just these markets, merged into the same account's state.
  const refreshMarkets = useEvent(async (ids: string[]) => {
    if (!userId || ids.length === 0) return
    try {
      const metrics = await fetchMetrics(userId, ids)
      setState((old) =>
        old.userId === userId
          ? { userId, metrics: { ...old.metrics, ...metrics } }
          : old
      )
    } catch (e) {
      console.error('Failed to refresh TV board positions', e)
    }
  })

  useEffect(() => {
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      requests.current++
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, idsKey, refresh])

  // Markets the account just traded on, re-read together after a moment.
  // Read through refs: a subscription keeps the callback it started with.
  const account = useRef(userId)
  account.current = userId
  const ids = useRef(new Set<string>())
  ids.current = new Set(JSON.parse(idsKey) as string[])
  const pending = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const traded = (contractIds: string[]) => {
    const board = contractIds.filter((id) => ids.current.has(id))
    if (board.length === 0) return
    board.forEach((id) => pending.current.add(id))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = [...pending.current]
      pending.current.clear()
      void refreshMarkets(next)
    }, AFTER_BET_MS)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  useApiSubscription({
    topics: ['global/new-bet'],
    enabled: !!userId,
    onBroadcast: (msg) => {
      const bets = (msg.data.bets ?? []) as Bet[]
      traded(
        bets
          .filter((b) => b.userId === account.current)
          .map((b) => b.contractId)
      )
    },
  })
  // The account's limit orders, sent whenever one is placed, filled (by
  // another trader's bet) or cancelled.
  useApiSubscription({
    topics: userId ? [`user/${userId}/orders`] : [],
    enabled: !!userId,
    onBroadcast: (msg) => {
      const bets = (msg.data.bets ?? []) as Bet[]
      traded(bets.map((b) => b.contractId))
    },
  })

  const metrics = state.userId === userId ? state.metrics : undefined
  return useMemo(
    () => (metrics ? boardPositions(contracts, metrics) : new Map()),
    [contracts, metrics]
  )
}
