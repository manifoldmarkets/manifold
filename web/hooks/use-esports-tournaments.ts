import { mapValues, pickBy, sortBy } from 'lodash'
import { useEffect, useMemo, useState } from 'react'

import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { EsportsMarketOverlay } from 'common/api/schema'
import { EsportsGame } from 'common/esports/types'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsPageVisible } from 'web/hooks/use-page-visible'

/** Picks up new series, kickoffs and results; prices move in between. */
const REFRESH_MS = 2 * 60_000
/** The endpoint's shared cache can serve a response this old. */
const MAX_SNAPSHOT_AGE_MS = 90_000
const MAX_LIVE_MARKETS = 100

export type EsportsMarkets = Record<string, EsportsMarketOverlay>

/** Whether a series' prices can be bet buttons: both sides known, still open. */
export const canBetOnSeries = (
  market: EsportsMarketOverlay | undefined,
  now = Date.now()
): market is EsportsMarketOverlay =>
  !!market &&
  !market.isResolved &&
  market.closeTime != null &&
  market.closeTime > now &&
  market.answers.length === 2 &&
  market.answers.every((a) => a.teamId != null)

/**
 * One game's tournaments with each series' market, refreshed every two
 * minutes while the page is visible. Open markets' prices follow their
 * `updated-answers` topic in between. Mount it keyed by game: each game keeps
 * its own copy in memory, so switching back is instant.
 */
export function useEsportsTournaments(game: EsportsGame) {
  const { data, error, refresh } = useAPIGetter(
    'get-esports-tournaments',
    { game },
    undefined,
    `esports-tournaments-${game}`
  )
  const isPageVisible = useIsPageVisible()
  useEffect(() => {
    if (!isPageVisible) return
    const timer = setInterval(() => refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [game, isPageVisible])

  // Prices heard since the last response, by answer id.
  const [live, setLive] = useState<
    Record<string, { prob: number; at: number }>
  >({})
  // A fresh response replaces what was heard, except prices newer than it.
  useEffect(() => {
    const oldest = Date.now() - MAX_SNAPSHOT_AGE_MS
    setLive((prev) => {
      const kept = pickBy(prev, (p) => p.at > oldest)
      return Object.keys(kept).length === Object.keys(prev).length ? prev : kept
    })
  }, [data])

  const openIds = sortBy(
    Object.values(data?.markets ?? {}).filter((m) => canBetOnSeries(m)),
    (m) => m.closeTime
  )
    .slice(0, MAX_LIVE_MARKETS)
    .map((m) => m.contractId)
    .join(',')
  const topics = useMemo(
    () =>
      openIds
        ? openIds.split(',').map((id) => `contract/${id}/updated-answers`)
        : [],
    [openIds]
  )
  useApiSubscription({
    topics,
    enabled: topics.length > 0 && isPageVisible,
    onBroadcast: ({ data }) => {
      const updates = (data.answers ?? []) as { id: string; prob?: number }[]
      const at = Date.now()
      setLive((prev) => {
        const next = { ...prev }
        for (const a of updates) {
          if (typeof a.prob === 'number' && a.prob >= 0 && a.prob <= 1)
            next[a.id] = { prob: a.prob, at }
        }
        return next
      })
    },
  })

  const markets: EsportsMarkets = useMemo(
    () =>
      mapValues(data?.markets ?? {}, (m) => ({
        ...m,
        answers: m.answers.map((a) =>
          live[a.id] ? { ...a, prob: live[a.id].prob } : a
        ),
      })),
    [data, live]
  )
  return { tournaments: data?.tournaments, markets, failed: !data && !!error }
}
