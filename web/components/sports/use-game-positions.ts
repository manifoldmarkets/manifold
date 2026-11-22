import { uniqBy } from 'lodash'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { LimitBet } from 'common/bet'
import { ContractMetric } from 'common/contract-metric'
import { run } from 'common/supabase/utils'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { db } from 'web/lib/supabase/db'
import { GamePositions, isOpenOrder, mergeFullRefresh } from './game-positions'

/** Bound URL length and response size as more schedule pages load. */
const CHUNK = 100
/**
 * Live updates (metrics and orders) for at most this many games the account
 * has a stake on; the rest catch up when the tab regains focus. Keeps the
 * socket's topic count proportional to the account's bets, not the feed.
 */
const MAX_LIVE_GAMES = 40

type State = {
  userId: string | undefined
  metrics: Record<string, ContractMetric[]>
  orders: Record<string, LimitBet[]>
  loaded: boolean
  error: boolean
}

const empty = (userId: string | undefined): State => ({
  userId,
  metrics: {},
  orders: {},
  loaded: false,
  error: false,
})

async function fetchMetrics(userId: string, ids: string[]) {
  const out: Record<string, ContractMetric[]> = {}
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const { data } = await run(
      db
        .from('user_contract_metrics')
        .select('data')
        .eq('user_id', userId)
        .in('contract_id', ids.slice(offset, offset + CHUNK))
        .not('answer_id', 'is', null)
    )
    for (const row of data) {
      const metric = row.data as ContractMetric
      if (!metric?.contractId || !metric.answerId) continue
      ;(out[metric.contractId] ??= []).push(metric)
    }
  }
  return out
}

async function fetchOrders(userId: string, ids: string[]) {
  const out: Record<string, LimitBet[]> = {}
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const bets = (await api('bets', {
      contractId: ids.slice(offset, offset + CHUNK),
      userId,
      kinds: 'open-limit',
    })) as LimitBet[]
    for (const bet of bets) {
      if (isOpenOrder(bet)) (out[bet.contractId] ??= []).push(bet)
    }
  }
  return out
}

/**
 * The signed-in account's positions and open limit orders on the loaded
 * games, in one batch (like useGameLikes), refreshed when the tab regains
 * focus and after a bet from a card. Games with a stake get live updates
 * over the per-contract metrics and orders topics.
 */
export function useGamePositions(gameIds: string[]) {
  const user = useUser()
  const userId = user?.id
  const idsKey = JSON.stringify([...new Set(gameIds)].sort())
  const [state, setState] = useState<State>(() => empty(userId))
  // A response from an older full refresh (or another account) is dropped.
  const requests = useRef(0)
  const mounted = useRef(false)
  // Bumped on every account change, so a read for account A that returns
  // after A → B → A is still thrown away.
  const epoch = useRef(0)
  // An orders broadcast and a metrics broadcast carry different facts.
  const touchedAt = useRef(new Map<string, number>())
  const revision = useRef(0)
  const acceptRead = (
    account: string,
    ids: string[],
    kind: 'metrics' | 'orders',
    started: number
  ) => {
    const previous = new Map<string, number>()
    for (const id of ids) {
      const key = JSON.stringify([account, id, kind])
      const at = touchedAt.current.get(key) ?? 0
      previous.set(id, at)
      if (at <= started) touchedAt.current.set(key, started)
    }
    return previous
  }

  const refresh = useEvent(async () => {
    const request = ++requests.current
    if (!userId) {
      setState(empty(undefined))
      return
    }
    const account = userId
    const session = epoch.current
    const ids: string[] = JSON.parse(idsKey)
    const startedAt = ++revision.current
    try {
      const [metrics, orders] = await Promise.all([
        fetchMetrics(account, ids),
        fetchOrders(account, ids),
      ])
      if (
        !mounted.current ||
        request !== requests.current ||
        session !== epoch.current
      )
        return
      const metricRevisions = acceptRead(account, ids, 'metrics', startedAt)
      const orderRevisions = acceptRead(account, ids, 'orders', startedAt)
      setState((old) => {
        const held = old.userId === account ? old : empty(account)
        return {
          userId: account,
          metrics: mergeFullRefresh(
            held.metrics,
            metrics,
            ids,
            startedAt,
            metricRevisions
          ),
          orders: mergeFullRefresh(
            held.orders,
            orders,
            ids,
            startedAt,
            orderRevisions
          ),
          loaded: true,
          error: false,
        }
      })
    } catch (e) {
      console.error('Failed to load sports positions', e)
      if (!mounted.current || request !== requests.current) return
      setState((old) => ({
        ...(old.userId === account ? old : empty(account)),
        loaded: true,
        error: true,
      }))
    }
  })

  /** Re-read one game, e.g. after its bet dialog closes. */
  const refreshGame = useEvent(async (id: string) => {
    if (!userId) return
    const account = userId
    const session = epoch.current
    const startedAt = ++revision.current
    try {
      const [metrics, orders] = await Promise.all([
        fetchMetrics(account, [id]),
        fetchOrders(account, [id]),
      ])
      if (!mounted.current || session !== epoch.current) return
      // The data is as of when the read started, not when it returned: if
      // the game got newer data meanwhile (a broadcast, a later re-read),
      // this read is stale.
      const acceptMetrics =
        (acceptRead(account, [id], 'metrics', startedAt).get(id) ?? 0) <=
        startedAt
      const acceptOrders =
        (acceptRead(account, [id], 'orders', startedAt).get(id) ?? 0) <=
        startedAt
      if (!acceptMetrics && !acceptOrders) return
      setState((old) => {
        if (session !== epoch.current) return old
        const held = old.userId === account ? old : empty(account)
        return {
          ...held,
          metrics: acceptMetrics
            ? { ...held.metrics, [id]: metrics[id] ?? [] }
            : held.metrics,
          orders: acceptOrders
            ? { ...held.orders, [id]: orders[id] ?? [] }
            : held.orders,
        }
      })
    } catch (e) {
      console.error('Failed to refresh sports positions', e)
    }
  })

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requests.current++
    }
  }, [])

  useEffect(() => {
    epoch.current++
    requests.current++
    touchedAt.current.clear()
  }, [userId])

  useEffect(() => {
    void refresh()
    // Catch bets placed on a market page or in another tab.
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

  const current = state.userId === userId ? state : empty(userId)

  // Nothing announces an order's expiry (the expiry job doesn't broadcast),
  // so drop expired orders ourselves when the earliest one lapses.
  useEffect(() => {
    const now = Date.now()
    let next = Infinity
    for (const orders of Object.values(current.orders)) {
      for (const order of orders) {
        if (order.expiresAt && order.expiresAt > now && order.expiresAt < next)
          next = order.expiresAt
      }
    }
    if (!Number.isFinite(next)) return
    const timer = setTimeout(() => {
      setState((old) => {
        if (old.userId !== userId) return old
        const orders: Record<string, LimitBet[]> = {}
        for (const [id, list] of Object.entries(old.orders)) {
          orders[id] = list.filter((b) => isOpenOrder(b))
        }
        return { ...old, orders }
      })
    }, next - now + 50)
    return () => clearTimeout(timer)
  }, [current.orders, userId])

  const byGame = useMemo(() => {
    const out: Record<string, GamePositions> = {}
    const ids: string[] = JSON.parse(idsKey)
    for (const id of ids) {
      const metrics = current.metrics[id] ?? []
      const orders = current.orders[id] ?? []
      if (metrics.length > 0 || orders.length > 0) out[id] = { metrics, orders }
    }
    return out
  }, [idsKey, current.metrics, current.orders])

  const liveIds = useMemo(
    () => Object.keys(byGame).slice(0, MAX_LIVE_GAMES),
    [byGame]
  )
  const topics = useMemo(
    () =>
      userId
        ? liveIds.flatMap((id) => [
            `contract/${id}/user-metrics/${userId}`,
            `contract/${id}/orders`,
          ])
        : [],
    [liveIds.join(','), userId]
  )

  useApiSubscription({
    topics,
    enabled: !!userId && topics.length > 0,
    onBroadcast: ({ topic, data }) => {
      const [, id, kind] = topic.split('/')
      if (!id || !userId) return
      if (kind === 'user-metrics') {
        const updated = ((data.metrics ?? []) as ContractMetric[]).filter(
          (m) => m.answerId && m.userId === userId && m.contractId === id
        )
        if (!updated.length) return
        touchedAt.current.set(
          JSON.stringify([userId, id, 'metrics']),
          ++revision.current
        )
        setState((old) => {
          if (old.userId !== userId) return old
          const byAnswer = new Map(
            (old.metrics[id] ?? []).map((m) => [m.answerId, m])
          )
          for (const metric of updated) {
            // Sold-out answers stay: they carry the realised profit.
            if (metric.answerId) byAnswer.set(metric.answerId, metric)
          }
          return {
            ...old,
            metrics: { ...old.metrics, [id]: [...byAnswer.values()] },
          }
        })
      } else if (kind === 'orders') {
        const mine = ((data.bets ?? []) as LimitBet[]).filter(
          (bet) => bet.userId === userId && bet.contractId === id
        )
        if (mine.length === 0) return
        touchedAt.current.set(
          JSON.stringify([userId, id, 'orders']),
          ++revision.current
        )
        setState((old) => {
          if (old.userId !== userId) return old
          const orders = uniqBy([...mine, ...(old.orders[id] ?? [])], 'id')
          return {
            ...old,
            orders: {
              ...old.orders,
              [id]: orders.filter((b) => isOpenOrder(b)),
            },
          }
        })
        // A fill changes the shares too. Re-read rather than wait for the
        // metrics broadcast: if this was the last open order the game would
        // leave the live set, and its metrics topic, before that arrives.
        if (mine.some((b) => b.isFilled || (b.fills?.length ?? 0) > 0))
          void refreshGame(id)
      }
    },
  })

  return {
    user,
    /**
     * Games the account has metric rows or open orders on. Whether that is
     * a live stake worth showing is getGameStake's call.
     */
    byGame,
    loading: user === undefined || (!!user && !current.loaded),
    error: current.error,
    refresh,
    refreshGame,
  }
}
