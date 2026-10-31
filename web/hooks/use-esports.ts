import { useEffect, useMemo } from 'react'
import { uniqBy } from 'lodash'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Answer } from 'common/answer'
import { Contract, isMultiCpmm } from 'common/contract'
import {
  ESPORTS_EVENTS,
  esportsEventView,
  EsportsEventView,
  esportsMarketIds,
  EsportsTitleKey,
} from 'common/esports'
import { getAnswersForContracts, getContracts } from 'common/supabase/contracts'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { db } from 'web/lib/supabase/db'

export type EsportsMarket = Contract & { answers?: Answer[] }

/** Picks up new series and settled ones the live topics missed. */
const REFRESH_MS = 2 * 60_000

// The rail, the bridge and the page can each ask at once: one read serves all.
let inflight: Promise<Record<string, EsportsMarket>> | undefined
let lastRead = 0

async function readMarkets(ids: string[]) {
  const [contracts, answers] = await Promise.all([
    getContracts(db, ids),
    getAnswersForContracts(db, ids),
  ])
  const next: Record<string, EsportsMarket> = {}
  for (const c of contracts) {
    next[c.id] = isMultiCpmm(c) ? { ...c, answers: answers[c.id] ?? [] } : c
  }
  return next
}

/**
 * The tournaments' markets (match megamarkets, winner markets, side bets),
 * read straight from the markets and kept live: prices and settled series
 * over each market's `updated-answers`, new series over `new-answer`.
 * `live` is off where only a count or a strip is shown.
 */
export function useEsports(live = true) {
  const ids = useMemo(() => esportsMarketIds(), [])
  const [markets, setMarkets] = usePersistentInMemoryState<
    Record<string, EsportsMarket> | undefined
  >(undefined, 'esports-markets')

  const load = useEvent(async () => {
    if (markets && Date.now() - lastRead < 10_000) return
    try {
      inflight ??= readMarkets(ids).finally(() => {
        inflight = undefined
        lastRead = Date.now()
      })
      setMarkets(await inflight)
    } catch (e) {
      console.error('Failed to load esports markets', e)
    }
  })

  const isPageVisible = useIsPageVisible()
  useEffect(() => {
    if (!isPageVisible) return
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [isPageVisible])

  const multiIds = Object.values(markets ?? {})
    .filter((m) => isMultiCpmm(m) && !m.isResolved)
    .map((m) => m.id)
  const topics = useMemo(
    () =>
      multiIds.flatMap((id) => [
        `contract/${id}/updated-answers`,
        `contract/${id}/new-answer`,
      ]),
    [multiIds.join(',')]
  )
  useApiSubscription({
    topics,
    enabled: live && isPageVisible && topics.length > 0,
    onBroadcast: ({ topic, data }) => {
      const id = topic.split('/')[1]
      if (!id) return
      setMarkets((prev) => {
        const market = prev?.[id]
        if (!prev || !market) return prev
        const answers = market.answers ?? []
        if (topic.endsWith('/new-answer')) {
          const answer = data.answer as Answer | undefined
          if (!answer) return prev
          return {
            ...prev,
            [id]: { ...market, answers: uniqBy([...answers, answer], 'id') },
          }
        }
        const updates = (data.answers ?? []) as (Partial<Answer> & {
          id: string
        })[]
        return {
          ...prev,
          [id]: {
            ...market,
            answers: answers.map((a) => {
              const u = updates.find((x) => x.id === a.id)
              if (!u) return a
              return {
                ...a,
                ...u,
                resolution:
                  'resolution' in u ? u.resolution ?? undefined : a.resolution,
                resolutionTime:
                  'resolutionTime' in u
                    ? u.resolutionTime ?? undefined
                    : a.resolutionTime,
              }
            }),
          },
        }
      })
    },
  })

  const now = Date.now()
  const events = useMemo(
    () =>
      markets
        ? ESPORTS_EVENTS.map((e) => esportsEventView(e, markets, now))
        : undefined,
    [markets]
  )
  return { markets, events, loading: !markets }
}

/** Open series per game, and in all: the esports chips' counts. */
export function esportsCounts(events: EsportsEventView[] | undefined) {
  const counts: Partial<Record<EsportsTitleKey, number>> = {}
  for (const v of events ?? []) {
    counts[v.event.title] = (counts[v.event.title] ?? 0) + v.openSeries.length
  }
  const total = Object.values(counts).reduce<number>((a, b) => a + (b ?? 0), 0)
  return { counts, total }
}
