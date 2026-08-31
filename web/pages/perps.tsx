import clsx from 'clsx'
import Link from 'next/link'
import { RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLinkIcon, PlusIcon, XIcon } from '@heroicons/react/outline'
import { useRouter } from 'next/router'
import { Answer } from 'common/answer'
import { APIResponse } from 'common/api/schema'
import { getUserFacingPnl, getUserFacingPnlPercent } from 'common/perps/pnl'
import { PerpPosition } from 'common/perps/position'
import { getDisplayProbability } from 'common/calculate'
import { Contract, PerpContract, contractPath } from 'common/contract'
import {
  PERPS_SKIP_ORACLE_FRESHNESS,
  isAdminId,
  isModId,
} from 'common/envs/constants'
import { contractFields, convertContract } from 'common/supabase/contracts'
import { fromNow } from 'client-common/lib/time'
import { nextFundingTimes } from 'common/perps/chart-projections'
import {
  formatCountdown,
  formatPrice,
  inferPriceDecimals,
} from 'common/perps/format'
import { useIsClient } from 'web/hooks/use-is-client'
import { getPerpTakerFeeBps } from 'common/perps/fees'
import {
  fundingPeriodNoun,
  fundingPeriodUnit,
  getFundingPeriodMs,
  getPerpFundingRate,
} from 'common/perps/funding'
import { PerpExplainerContent } from 'web/components/perps/perp-market-explainer'
import { getOracleFreshness } from 'common/perps/oracle'
import { DAY_MS, HOUR_MS, YEAR_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { PerpBetPanel } from 'web/components/perps/perp-bet-panel'
import { PerpChart, prefetchPerpChart } from 'web/components/perps/perp-chart'
import { PerpOracleAttribution } from 'web/components/perps/perp-oracle-attribution'
import { PerpPositionPanel } from 'web/components/perps/perp-position-panel'
import { useLivePerpContract } from 'web/components/perps/use-live-perp-contract'
import { usePerpPositions } from 'web/components/perps/use-perp-positions'
import { Avatar } from 'web/components/widgets/avatar'
import { TokenNumber } from 'web/components/widgets/token-number'
import { Tooltip } from 'web/components/widgets/tooltip'
import { api } from 'web/lib/api/api'
import { db } from 'web/lib/supabase/db'
import { PerpSuggestion } from 'common/perps/suggestion'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'

const revalidate = 60

// Switches for the additions layered onto the v1 hub. Each also landed as
// its own commit, but flipping one here is the one-line way to try the page
// without it.
const HUB_FEATURES = {
  /** "Top mover" in the header stats strip. */
  topMover: true,
  /** 24h / 7d toggle on the watchlist change column. */
  changeWindow: true,
  /** "Your positions" rail card when signed in. */
  positions: true,
  /** Cross-market recent-activity feed in the rail. */
  activity: true,
}

// Perps are created unlisted and flipped public at launch, so the search APIs
// can't enumerate them — the anon supabase client can, since contracts RLS is
// public-read. That keeps this page automated: any perp shows up on the next
// revalidate with no list to maintain.
// The one rule for what this page may show — applied to the static props AND
// to the live board, so a market unlisted or deleted mid-incident drops out
// of an already-open tab on the next poll instead of staying selected with
// its trading UI. Perps launch UNLISTED (create-perp's default) and stay that
// way through smoke tests and the staged rollout; this page is the one place
// that enumerates them, so it must not be the leak. Only a local dev server
// shows the unlisted queue, for previewing a batch.
const isListed = (c: Contract): c is PerpContract =>
  c.mechanism === 'perp' &&
  !c.deleted &&
  (c.visibility === 'public' || process.env.NODE_ENV === 'development')

export async function getStaticProps() {
  try {
    // outcome_type is indexed (partial index over non-binary types);
    // mechanism is not, and a sequential scan of contracts trips the anon
    // role's statement timeout.
    const { data, error } = await db
      .from('contracts')
      .select(contractFields)
      .eq('outcome_type', 'PERP')
      .order('created_time', { ascending: true })
    if (error) throw error
    const perps = (data ?? [])
      .map(convertContract)
      .filter(isListed)
      // Perp descriptions carry the full oracle methodology — pages of text
      // the page never renders. Strip them from the static payload.
      .map((c) => ({ ...c, description: '' }))
    return { props: { perps }, revalidate }
  } catch (e) {
    // Throw rather than publish an empty board: on a failed revalidation
    // Next keeps serving the last good page and retries next request.
    console.error('perps page getStaticProps failed', e)
    throw e
  }
}

// ---------------------------------------------------------------------------
// Display helpers

// Tickers, keyed by the stable oracle feed id (same reasoning as
// ORACLE_TICK_DECORATIONS: never infer a label from a renameable question).
// Unknown feeds fall back to the feed id's leading segment, so a new perp is
// merely unglamorous until someone adds a line here, never broken.
const FEED_TICKERS: Record<string, string> = {
  'btc-usd': 'BTC',
  'trump-approval-rating': 'TRUMP',
  'openrouter-open-weight-share': 'OPENW',
  'spyx-usd': 'SPYx',
  'qqqx-usd': 'QQQx',
  'nvdax-usd': 'NVDAx',
  'gldx-usd': 'GLDx',
  'uk-grid-carbon': 'UKCO2',
}

const tickerOf = (c: PerpContract) =>
  FEED_TICKERS[c.oracleFeedId ?? ''] ??
  (c.oracleFeedId ?? c.slug).split('-')[0].toUpperCase().slice(0, 6)

const PERCENT_FEEDS = new Set([
  'trump-approval-rating',
  'openrouter-open-weight-share',
])

const displayPrice = (c: PerpContract) => {
  const price = Number(
    c.isResolved ? c.resolvedOraclePrice ?? c.oraclePrice : c.oraclePrice
  )
  if (!Number.isFinite(price)) return '—'
  const feedId = c.oracleFeedId ?? ''
  const prefix = feedId.endsWith('-usd') ? '$' : ''
  const suffix = PERCENT_FEEDS.has(feedId) ? '%' : ''
  return prefix + formatPrice(price, inferPriceDecimals([price])) + suffix
}

// Human label for a topic slug: strip the '-default' suffix of catch-all
// groups and randomized group-id suffixes (e.g. 'sp500-p9Q6AzO68S'), fix
// casing on known acronyms/brands.
const TOPIC_CASING: Record<string, string> = {
  ai: 'AI',
  us: 'US',
  uk: 'UK',
  usd: 'USD',
  openrouter: 'OpenRouter',
  sp500: 'S&P 500',
  qqq: 'QQQ',
}
const topicLabel = (slug: string) =>
  slug
    .replace(/-default$/, '')
    .split('-')
    .filter((w) => !(w.length >= 8 && /\d/.test(w) && /[A-Z]/.test(w)))
    .map((w) => TOPIC_CASING[w] ?? (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')

// A related market that is already ~decided adds nothing to the list.
const isNearCertain = (c: Contract) => {
  if (c.outcomeType !== 'BINARY') return false
  const p = getDisplayProbability(c)
  return p > 0.95 || p < 0.05
}

// Which way the money leans: the share of open interest on the heavier side.
// This is the closest thing a perp has to "Manifold's forecast" — it is what
// traders are actually positioned for, and it is what funding punishes.
const leanOf = (c: PerpContract) => {
  const long = c.openInterestLong ?? 0
  const short = c.openInterestShort ?? 0
  const total = long + short
  if (total <= 0) return null
  const longShare = long / total
  return {
    dir: longShare >= 0.5 ? ('long' as const) : ('short' as const),
    share: longShare >= 0.5 ? longShare : 1 - longShare,
    longShare,
  }
}

const pct = (x: number, digits = 1) =>
  `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`

// Exchange-style tick flash: 'up' | 'down' for ~700ms after a change.
const useTickFlash = (value: number) => {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prev = useRef(value)
  useEffect(() => {
    if (value === prev.current || !Number.isFinite(value)) return
    setFlash(value > prev.current ? 'up' : 'down')
    prev.current = value
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [value])
  return flash
}

// ---------------------------------------------------------------------------
// Live data

// One batched poll for the whole page. Matches the 15s scheduler cadence used
// by useLivePerpContract; same never-rewind guards.
const POLL_MS = 15_000
// The schema's cap on ids per markets-by-ids call.
const MARKETS_BY_IDS_MAX = 100

const usePerpBoard = (initial: PerpContract[]) => {
  const [contracts, setContracts] = useState(initial)
  const idKey = initial.map((c) => c.id).join(',')
  // Resolved perps stay on the board — RelatedMarkets excludes every perp id,
  // resolved included — but nothing renders their live fields: every other
  // consumer works off `open`. Polling them would grow the per-tick request
  // count with every perp ever launched, forever.
  const pollKey = initial
    .filter((c) => !c.isResolved)
    .map((c) => c.id)
    .join(',')

  // New page props are authoritative about WHICH markets belong on the board.
  // useState reads `initial` once, so without this an ISR regeneration (or a
  // client-side nav back to this route) that drops an unlisted or deleted
  // market would leave it rendered from its last public snapshot — no longer
  // polled, but still showing its terminal and trade controls. Live fields we
  // already polled win over the staler static ones, same never-rewind guard
  // as the poll below.
  useEffect(() => {
    setContracts((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]))
      const next = initial.map((c) => {
        const live = byId.get(c.id)
        return live && (live.oraclePriceTime ?? 0) > (c.oraclePriceTime ?? 0)
          ? ({ ...c, ...live } as PerpContract)
          : c
      })
      // Mount and same-membership regenerations must not force a render.
      return next.length === prev.length && next.every((c, i) => c === prev[i])
        ? prev
        : next
    })
  }, [idKey])

  useEffect(() => {
    const ids = pollKey ? pollKey.split(',') : []
    if (ids.length === 0) return
    let cancelled = false
    // markets-by-ids caps a request at 100 ids, so chunk rather than let the
    // 101st market silently stop the poll — and with it live unlisting.
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += MARKETS_BY_IDS_MAX) {
      chunks.push(ids.slice(i, i + MARKETS_BY_IDS_MAX))
    }
    const poll = () =>
      Promise.all(chunks.map((chunk) => api('markets-by-ids', { ids: chunk })))
        .then((pages) => {
          if (cancelled) return
          const fetched = pages.flat()
          const byId = new Map(fetched.map((m) => [m.id, m]))
          setContracts((prev) =>
            prev.map((c) => {
              const m = byId.get(c.id)
              if (!m || m.mechanism !== 'perp') return c
              if ((m.oraclePriceTime ?? 0) < (c.oraclePriceTime ?? 0)) return c
              if (c.isResolved && !m.isResolved) return c
              return { ...c, ...m } as PerpContract
            })
          )
        })
        .catch(() => {})
    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [pollKey])

  return contracts
}

// Seven days of hourly oracle prices per perp: drives the 7d change (the
// default sort), the watchlist sparklines, and the ticker. One request per
// market at hourly resolution is far cheaper than the five-minute series
// the contract-card sparkline pulls, and hourly is plenty for a week.
type WeekSeries = { ts: number; price: number }[]
const useWeekSeries = (perps: PerpContract[]) => {
  const [byId, setById] = useState<Record<string, WeekSeries>>({})
  const key = perps.map((c) => `${c.id}:${c.oracleFeedId}`).join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const pairs = key.split(',').map((s) => s.split(':') as [string, string])
    // `since` on an hour boundary: the buckets are hourly anyway, and a
    // millisecond bound would give every visitor a unique URL, so nothing
    // could be served from the edge cache.
    const since = Math.floor(Date.now() / HOUR_MS) * HOUR_MS - 7 * DAY_MS
    Promise.all(
      pairs.map(([id, feedId]) =>
        api('get-oracle-price-series', {
          feedId,
          since,
          bucketSeconds: 3600,
          limit: 400,
        })
          .then((res) => [
            id,
            res
              .filter((p) => Number.isFinite(p.price) && p.price > 0)
              .sort((a, b) => a.ts - b.ts),
          ])
          .catch(() => [id, [] as WeekSeries])
      )
    ).then((entries) => {
      if (!cancelled)
        setById(Object.fromEntries(entries as [string, WeekSeries][]))
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return byId
}

// Change from the first point inside the window to the live price (not the
// last hourly bucket). The week series is hourly, so a 24h window reads the
// point nearest to a day ago.
const changeSince = (
  series: WeekSeries | undefined,
  c: PerpContract,
  windowMs: number
) => {
  if (!series || series.length < 2) return undefined
  const cutoff = Date.now() - windowMs
  const start = series.find((p) => p.ts >= cutoff) ?? series[0]
  if (start === series[series.length - 1]) return undefined
  const last = Number(c.oraclePrice) || series[series.length - 1].price
  return start.price > 0 ? last / start.price - 1 : undefined
}

const weekChange = (series: WeekSeries | undefined, c: PerpContract) =>
  changeSince(series, c, 7 * DAY_MS)

// Related markets per perp, via the group-overlap endpoint behind the contract
// page's related-questions rail: everything sharing a topic with the perp,
// ranked by importance.
// Fetched on demand for the SELECTED market and kept for the session, so
// the first paint costs one request rather than one per market, and
// switching back to a market is instant.
const useRelatedMarkets = (selectedId: string | undefined) => {
  const [byPerp, setByPerp] = useState<Record<string, Contract[]>>({})

  useEffect(() => {
    if (!selectedId || byPerp[selectedId]) return
    let cancelled = false
    api('get-related-markets-by-group', {
      contractId: selectedId,
      limit: 30,
      offset: 0,
    })
      .then((r) => {
        if (!cancelled)
          setByPerp((prev) => ({ ...prev, [selectedId]: r.groupContracts }))
      })
      .catch(() => {
        if (!cancelled) setByPerp((prev) => ({ ...prev, [selectedId]: [] }))
      })
    return () => {
      cancelled = true
    }
    // byPerp is read only as a "have we fetched this yet" guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return byPerp
}

// get-related-markets-by-group returns contracts without their answers, so a
// multiple-choice row had nothing to show. markets-by-ids attaches answers;
// hydrate just those rows, one batched request per new set of ids.
const answersOf = (c: Contract): Answer[] | undefined =>
  (c as { answers?: Answer[] }).answers

const useAnswersFor = (contracts: Contract[]) => {
  const [byId, setById] = useState<Record<string, Contract>>({})
  const key = contracts
    .filter(
      (c) =>
        c.outcomeType === 'MULTIPLE_CHOICE' &&
        !answersOf(c)?.length &&
        !byId[c.id]
    )
    .map((c) => c.id)
    .join(',')
  useEffect(() => {
    if (!key) return
    let cancelled = false
    api('markets-by-ids', { ids: key.split(',') })
      .then((res) => {
        if (cancelled) return
        setById((prev) => ({
          ...prev,
          ...Object.fromEntries(res.map((c) => [c.id, c])),
        }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key])
  return byId
}

// The viewer's open positions across every perp: one request per market,
// refreshed every 30s. Null while loading or signed out; [] when flat.
// The two live feeds below hit uncached endpoints, so they are polite by
// construction: one request per tick (not one per market), a tick is
// skipped while the previous one is still in flight, nothing runs while
// the tab is hidden, and a tab coming back refreshes once immediately.
const FEED_POLL_MS = 60_000
const pollWhileVisible = (load: () => Promise<unknown>, intervalMs: number) => {
  let inFlight = false
  const tick = () => {
    if (inFlight || document.visibilityState === 'hidden') return
    inFlight = true
    load().finally(() => {
      inFlight = false
    })
  }
  tick()
  const interval = setInterval(tick, intervalMs)
  document.addEventListener('visibilitychange', tick)
  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', tick)
  }
}

type MyPosition = APIResponse<'get-perp-positions'>[number]
const useMyPositions = (userId: string | undefined, perps: PerpContract[]) => {
  const [rows, setRows] = useState<MyPosition[] | null>(null)
  const key = perps.map((c) => c.id).join(',')
  useEffect(() => {
    if (!userId || !key) {
      setRows(null)
      return
    }
    let cancelled = false
    const onPage = new Set(key.split(','))
    // The user's whole perp book in one call; keep only markets on the page.
    const load = () =>
      api('get-perp-positions', { userId })
        .then((rs) => {
          if (!cancelled) setRows(rs.filter((r) => onPage.has(r.contractId)))
        })
        .catch(() => {})
    const stop = pollWhileVisible(load, FEED_POLL_MS)
    return () => {
      cancelled = true
      stop()
    }
  }, [userId, key])
  return rows
}

// Recent trades across every perp, newest first, in one request. API-key
// (bot) trades and funding ticks are excluded — this is the human tape.
type ActivityEvent = APIResponse<'get-perp-events'>[number]
const ACTIVITY_TYPES = new Set(['open', 'add', 'close', 'liquidation', 'adl'])
const useRecentActivity = (perps: PerpContract[]) => {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const key = perps.map((c) => c.id).join(',')
  useEffect(() => {
    if (!key) return
    let cancelled = false
    const load = () =>
      api('get-perp-events', {
        contractIds: key.split(','),
        limit: 40,
        excludeApi: true,
      })
        .then((rs) => {
          if (cancelled) return
          setEvents(
            rs
              .filter((e) => ACTIVITY_TYPES.has(e.eventType) && e.userId)
              .slice(0, 30)
          )
        })
        .catch(() => {})
    const stop = pollWhileVisible(load, FEED_POLL_MS)
    return () => {
      cancelled = true
      stop()
    }
  }, [key])
  return events
}

// Warm a chart before it is asked for, so switching never shows a loading
// state. Two tiers so a visit does not cost a history fetch per market:
//  - intent: hovering or focusing any switch button (watchlist row, ticker
//    item, chip, top mover) warms that one market — warmChart below;
//  - idle: the two most-traded markets other than the selected one, the
//    likeliest next taps on touch screens where there is no hover.
// The idle tier waits for the browser to report idle (or 2s), never runs
// while the tab is hidden, and is skipped on data-saver connections. The
// in-flight map in perp-chart dedupes against the visible chart's fetch,
// and `since` bounds are bucket-aligned so visitors share edge cache
// entries.
const warmChart = (c: PerpContract) => {
  prefetchPerpChart(c).catch(() => {})
}
const IDLE_PREFETCH_COUNT = 2
const usePrefetchCharts = (
  perps: PerpContract[],
  selectedId: string | undefined
) => {
  const idKey = perps.map((c) => c.id).join(',')
  useEffect(() => {
    let cancelled = false
    const saveData = (navigator as { connection?: { saveData?: boolean } })
      .connection?.saveData
    if (saveData) return
    const targets = [...perps]
      .filter((c) => c.id !== selectedId)
      .sort(
        (a, b) =>
          (b.volume24Hours ?? 0) - (a.volume24Hours ?? 0) ||
          (b.volume ?? 0) - (a.volume ?? 0)
      )
      .slice(0, IDLE_PREFETCH_COUNT)
    const run = async () => {
      for (const c of targets) {
        if (cancelled) return
        while (document.visibilityState === 'hidden') {
          await new Promise<void>((resolve) =>
            document.addEventListener('visibilitychange', () => resolve(), {
              once: true,
            })
          )
          if (cancelled) return
        }
        await prefetchPerpChart(c).catch(() => {})
      }
    }
    const w = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number
      cancelIdleCallback?: (id: number) => void
    }
    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (w.requestIdleCallback) {
      idleId = w.requestIdleCallback(run, { timeout: 2000 })
    } else {
      timeoutId = setTimeout(run, 1500)
    }
    return () => {
      cancelled = true
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId)
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, selectedId])
}

// ---------------------------------------------------------------------------
// Page

type SortKey = 'change' | 'volume' | 'lean' | 'funding'
type ChangeWindow = '24h' | '7d'
const windowMs = (w: ChangeWindow) => (w === '24h' ? DAY_MS : 7 * DAY_MS)

// Watchlist column template, shared by the header and every row so the
// columns line up: ticker · sparkline · price · change · lean. The sparkline
// column drops out below 360px.
const WATCH_GRID =
  'grid items-center gap-x-2 grid-cols-[3.25rem_minmax(0,1fr)_3.25rem_3.75rem] min-[360px]:grid-cols-[3.25rem_minmax(0,1fr)_3.25rem_3.5rem_3.75rem]'
const DEFAULT_ROWS = 5

export default function PerpsPage(props: { perps: Contract[] }) {
  const initial = useMemo(() => props.perps.filter(isListed), [props.perps])
  const contracts = usePerpBoard(initial)
  // Re-checked on every poll: markets-by-ids carries visibility and deletion.
  const open = contracts.filter((c) => !c.isResolved && isListed(c))

  const week = useWeekSeries(open)
  const activity = useRecentActivity(HUB_FEATURES.activity ? open : [])
  const user = useUser()
  // `?as=<userId>` previews the positions card as another user — positions
  // are public (the holders tab lists them), so this leaks nothing, and it
  // lets the card be reviewed without an account that holds perps.
  const router = useRouter()
  const previewAs =
    typeof router.query.as === 'string' ? router.query.as : undefined
  const myPositions = useMyPositions(
    HUB_FEATURES.positions ? previewAs ?? user?.id : undefined,
    open
  )

  // The flagship (most traded) market is the landing chart.
  const flagshipId = useMemo(
    () =>
      [...initial]
        .filter((c) => !c.isResolved)
        .sort(
          (a, b) =>
            (b.volume24Hours ?? 0) - (a.volume24Hours ?? 0) ||
            (b.volume ?? 0) - (a.volume ?? 0)
        )[0]?.id,
    [initial]
  )
  const [selectedId, setSelectedId] = useState<string>()
  const selected =
    open.find((c) => c.id === selectedId) ??
    open.find((c) => c.id === flagshipId) ??
    open[0]
  const related = useRelatedMarkets(selected?.id)
  usePrefetchCharts(open, selected?.id)
  // Ticker clicks can happen from anywhere on the page: select and bring
  // the terminal into view (its scroll margin clears the pinned tape).
  const selectRow = (id: string) => {
    setSelectedId(id)
    document
      .getElementById('perp-terminal')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: 'change',
    desc: true,
  })
  const [changeWindow, setChangeWindow] = useState<ChangeWindow>('7d')
  const sortValue = (c: PerpContract): number => {
    switch (sort.key) {
      case 'change': {
        // Biggest movers first, whichever direction.
        const change = changeSince(week[c.id], c, windowMs(changeWindow))
        return change === undefined ? -Infinity : Math.abs(change)
      }
      case 'volume':
        return c.volume24Hours ?? 0
      case 'lean':
        return leanOf(c)?.longShare ?? -Infinity
      case 'funding':
        return getPerpFundingRate(c)
    }
  }
  const sorted = [...open].sort((a, b) => {
    const d = sortValue(b) - sortValue(a)
    // Unranked (no data) always sinks regardless of direction.
    if (!Number.isFinite(d)) return sortValue(a) === -Infinity ? 1 : -1
    return sort.desc ? d : -d
  })
  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))

  const stats = {
    volume24h: open.reduce((sum, c) => sum + (c.volume24Hours ?? 0), 0),
    openInterest: open.reduce(
      (sum, c) => sum + (c.openInterestLong ?? 0) + (c.openInterestShort ?? 0),
      0
    ),
    traders: open.reduce((sum, c) => sum + (c.uniqueBettorCount ?? 0), 0),
  }

  return (
    <Page trackPageView="perps page" className="!col-span-10">
      <SEO
        title="Perpetuals"
        description="Leveraged long and short markets on live numbers — Bitcoin, stocks, approval ratings and more. No expiry date."
        url="/perps"
      />
      <TickerTape contracts={sorted} week={week} onSelect={selectRow} />

      <Col className="w-full gap-8 px-3 py-5 sm:px-6">
        <Row className="flex-wrap items-end justify-between gap-4">
          <Col className="gap-1">
            <h1 className="text-ink-1000 text-3xl font-semibold sm:text-4xl">
              Perpetuals
            </h1>
            <div className="text-ink-600 text-sm sm:text-base">
              Go long or short on a live number, with leverage. No expiry date.{' '}
              <a
                href="#perps-explainer"
                className="text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                How perps work ↓
              </a>
            </div>
          </Col>
          <div className="sm:divide-ink-200 sm:dark:divide-ink-300 grid w-full grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:w-auto sm:divide-x">
            <Stat label="24h volume" amount={stats.volume24h} />
            <Stat label="Open interest" amount={stats.openInterest} />
            <Stat label="Traders" value={stats.traders.toLocaleString()} />
            <Stat label="Markets" value={String(open.length)} />
            {HUB_FEATURES.topMover && (
              <TopMover contracts={open} week={week} onSelect={selectRow} />
            )}
          </div>
        </Row>

        {selected ? (
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            {/* Fixed-width rail: a third of the grid was only ~330px at the
                xl breakpoint, not enough for a ticker, sparkline, price,
                change and lean side by side. */}
            <div className="min-w-0">
              <Terminal
                key={selected.id}
                contract={selected}
                all={sorted}
                week={week[selected.id]}
                onSelect={setSelectedId}
              />
            </div>
            <Col className="min-w-0 gap-4 xl:row-span-2">
              {HUB_FEATURES.positions && !!myPositions?.length && (
                <YourPositions
                  positions={myPositions}
                  contracts={open}
                  onSelect={selectRow}
                />
              )}
              <Watchlist
                contracts={sorted}
                week={week}
                selectedId={selected.id}
                sort={sort}
                onSort={toggleSort}
                changeWindow={changeWindow}
                onChangeWindow={setChangeWindow}
                onSelect={setSelectedId}
              />
              <RelatedMarkets
                perp={selected}
                markets={related[selected.id]}
                perpIds={new Set(contracts.map((c) => c.id))}
              />
            </Col>
            {/* Under the terminal on desktop (the rail spans both rows), last
                on mobile: it is the widest-reading card and the least urgent. */}
            {HUB_FEATURES.activity && (
              <div className="min-w-0 xl:col-start-1">
                <RecentActivity
                  events={activity}
                  contracts={open}
                  onSelect={selectRow}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="text-ink-500 border-ink-200 dark:border-ink-300 rounded-xl border border-dashed p-6 text-sm">
            No open perpetual markets right now.
          </div>
        )}

        <Explainer contract={selected} />

        <Suggestions />
      </Col>
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Pieces

const SectionHeader = (props: { title: string }) => (
  <div className="text-ink-400 text-xs font-semibold uppercase tracking-widest">
    {props.title}
  </div>
)

// Mana amounts render through TokenNumber (coin icon + number) rather than
// the text moniker: the monospace stack has no glyph for it.
const Stat = (props: { label: string; amount?: number; value?: string }) => (
  <Col className="sm:px-4 sm:first:pl-0 sm:last:pr-0">
    <div className="text-ink-400 text-[11px] uppercase tracking-wider">
      {props.label}
    </div>
    {props.amount !== undefined ? (
      <TokenNumber
        amount={props.amount}
        numberType="short"
        className="text-ink-900 font-mono text-lg font-semibold tabular-nums"
      />
    ) : (
      <div className="text-ink-900 font-mono text-lg font-semibold tabular-nums">
        {props.value}
      </div>
    )}
  </Col>
)

// The reason a trader reopens the page: how are my trades doing, across all
// markets, at a glance. Side, leverage, size, P&L, and how far the price
// is from liquidation. Click a row to load that market.
const YourPositions = (props: {
  positions: MyPosition[]
  contracts: PerpContract[]
  onSelect: (id: string) => void
}) => {
  const { positions, contracts, onSelect } = props
  const rows = positions
    .map((p) => {
      const contract = contracts.find((c) => c.id === p.contractId)
      if (!contract) return null
      const price = Number(contract.oraclePrice)
      const position = p as unknown as PerpPosition
      const pnl = getUserFacingPnl(position, price)
      const pnlPct = getUserFacingPnlPercent(position, price)
      const liqDistance =
        Number.isFinite(p.liquidationPrice) && price > 0
          ? (p.liquidationPrice - price) / price
          : undefined
      return { p, contract, pnl, pnlPct, liqDistance }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.p.size - a.p.size)
  if (rows.length === 0) return null
  const totalPnl = rows.reduce((sum, r) => sum + r.pnl, 0)

  return (
    <Col className="border-ink-200 dark:border-ink-300 bg-canvas-0 overflow-hidden rounded-xl border">
      <Row className="border-ink-200 dark:border-ink-300 items-center justify-between border-b px-3 py-2">
        <span className="text-ink-400 text-[11px] font-medium uppercase tracking-wider">
          Your positions
        </span>
        <Row className="items-center gap-1 text-xs">
          <span className="text-ink-400">P&L</span>
          <TokenNumber
            amount={totalPnl}
            numberType="short"
            className={clsx(
              'font-mono font-semibold tabular-nums',
              totalPnl >= 0
                ? 'text-teal-600 dark:text-teal-400'
                : 'text-scarlet-600 dark:text-scarlet-400'
            )}
          />
        </Row>
      </Row>
      <Col className="divide-ink-200 dark:divide-ink-300 divide-y">
        {rows.map(({ p, contract, pnl, pnlPct, liqDistance }) => {
          const long = p.direction === 'long'
          return (
            <button
              key={`${p.contractId}-${p.direction}`}
              onClick={() => onSelect(contract.id)}
              className="hover:bg-canvas-50 grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-2 text-left"
            >
              <span className="text-ink-900 truncate font-mono text-sm font-bold">
                {tickerOf(contract)}
              </span>
              <Col className="min-w-0 gap-0.5">
                <Row className="items-center gap-1.5 text-xs">
                  <span
                    className={clsx(
                      'rounded px-1 font-mono font-semibold uppercase',
                      long
                        ? 'bg-teal-500/10 text-teal-700 dark:text-teal-400'
                        : 'bg-scarlet-500/10 text-scarlet-700 dark:text-scarlet-400'
                    )}
                  >
                    {p.direction} {Math.round(p.leverage)}×
                  </span>
                  <TokenNumber
                    amount={p.size}
                    numberType="short"
                    className="text-ink-600 font-mono tabular-nums"
                  />
                </Row>
                {liqDistance !== undefined && (
                  <span className="text-ink-400 text-xs">
                    liquidates at {pct(liqDistance)} from here
                  </span>
                )}
              </Col>
              <Col className="items-end">
                <TokenNumber
                  amount={pnl}
                  numberType="short"
                  className={clsx(
                    'font-mono text-sm font-semibold tabular-nums',
                    pnl >= 0
                      ? 'text-teal-600 dark:text-teal-400'
                      : 'text-scarlet-600 dark:text-scarlet-400'
                  )}
                />
                <ChangeLabel change={pnlPct} className="text-xs" />
              </Col>
            </button>
          )
        })}
      </Col>
    </Col>
  )
}

const ACTIVITY_VERB: Record<string, string> = {
  open: 'opened',
  add: 'added to',
  close: 'closed',
  liquidation: 'was liquidated on',
  adl: 'was deleveraged on',
}

// The human tape: who did what, across all markets. Liquidations are the
// interesting rows — a run of them on one side means that side is crowded
// and fragile — so they get the accent color.
const RecentActivity = (props: {
  events: ActivityEvent[] | null
  contracts: PerpContract[]
  onSelect: (id: string) => void
}) => {
  const { events, contracts, onSelect } = props
  const [showAll, setShowAll] = useState(false)
  const isClient = useIsClient()
  const rows = (events ?? [])
    .map((e) => ({ e, contract: contracts.find((c) => c.id === e.contractId) }))
    .filter(
      (r): r is { e: ActivityEvent; contract: PerpContract } => !!r.contract
    )
  const visible = showAll ? rows : rows.slice(0, 8)
  return (
    <Col className="border-ink-200 dark:border-ink-300 bg-canvas-0 overflow-hidden rounded-xl border">
      <Row className="border-ink-200 dark:border-ink-300 items-baseline justify-between border-b px-3 py-2">
        <span className="text-ink-400 text-[11px] font-medium uppercase tracking-wider">
          Recent activity
        </span>
        <span className="text-ink-400 text-xs">all markets</span>
      </Row>
      {/* One line per event, two columns on wide screens: eight events in
          four lines instead of eight tall rows. */}
      <div className="divide-ink-200 dark:divide-ink-300 grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0">
        {events === null ? (
          <Col className="gap-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-canvas-50 h-5 animate-pulse rounded" />
            ))}
          </Col>
        ) : rows.length === 0 ? (
          <div className="text-ink-400 p-3 text-sm">No trades yet.</div>
        ) : (
          visible.map(({ e, contract }) => {
            const liquidated = e.eventType === 'liquidation'
            const closing =
              e.eventType === 'close' || liquidated || e.eventType === 'adl'
            return (
              <button
                key={e.id}
                onClick={() => onSelect(contract.id)}
                className="hover:bg-canvas-50 border-ink-200 dark:border-ink-300 flex items-center gap-2 px-3 py-1.5 text-left text-xs sm:border-b"
              >
                <Avatar
                  username={e.username ?? undefined}
                  avatarUrl={e.avatarUrl ?? undefined}
                  size="2xs"
                  noLink
                />
                <span className="text-ink-600 min-w-0 flex-1 truncate leading-snug">
                  <span className="text-ink-900 font-medium">
                    {e.userName ?? e.username ?? 'Someone'}
                  </span>{' '}
                  <span
                    className={
                      liquidated
                        ? 'text-scarlet-600 dark:text-scarlet-400 font-medium'
                        : undefined
                    }
                  >
                    {ACTIVITY_VERB[e.eventType]}
                  </span>{' '}
                  {e.leverage != null && !closing && (
                    <span className="font-mono">
                      {Math.round(e.leverage)}×{' '}
                    </span>
                  )}
                  {e.direction && (
                    <span
                      className={clsx(
                        'font-semibold',
                        e.direction === 'long'
                          ? 'text-teal-600 dark:text-teal-400'
                          : 'text-scarlet-600 dark:text-scarlet-400'
                      )}
                    >
                      {e.direction}
                    </span>
                  )}{' '}
                  <span className="text-ink-900 font-mono font-semibold">
                    {tickerOf(contract)}
                  </span>
                  {closing && e.pnl != null && Math.abs(e.pnl) >= 0.5 && (
                    <>
                      {' '}
                      <span
                        className={clsx(
                          'inline-flex items-center font-semibold tabular-nums',
                          e.pnl >= 0
                            ? 'text-teal-600 dark:text-teal-400'
                            : 'text-scarlet-600 dark:text-scarlet-400'
                        )}
                      >
                        {e.pnl >= 0 ? '+' : '−'}
                        <TokenNumber
                          amount={Math.abs(e.pnl)}
                          numberType="short"
                        />
                      </span>
                    </>
                  )}
                </span>
                <TokenNumber
                  amount={Math.abs(e.sizeDelta)}
                  numberType="short"
                  className="text-ink-700 shrink-0 font-mono tabular-nums"
                />
                <span className="text-ink-400 w-14 shrink-0 whitespace-nowrap text-right">
                  {isClient ? fromNow(e.ts).replace(' ago', '') : ''}
                </span>
              </button>
            )
          })
        )}
      </div>
      {rows.length > 8 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-ink-500 hover:bg-canvas-50 hover:text-ink-700 border-ink-200 dark:border-ink-300 border-t px-3 py-2 text-xs"
        >
          {showAll ? 'Show fewer' : `Show ${rows.length}`}
        </button>
      )}
    </Col>
  )
}

// The page's one-line answer to "what happened while I was away": the
// market with the largest 24h move, in either direction. Click to load it.
const TopMover = (props: {
  contracts: PerpContract[]
  week: Record<string, WeekSeries>
  onSelect: (id: string) => void
}) => {
  const { contracts, week, onSelect } = props
  let best: { contract: PerpContract; change: number } | undefined
  for (const c of contracts) {
    const change = changeSince(week[c.id], c, DAY_MS)
    if (change === undefined) continue
    if (!best || Math.abs(change) > Math.abs(best.change))
      best = { contract: c, change }
  }
  if (!best) return null
  return (
    <Col className="sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <div className="text-ink-400 text-[11px] uppercase tracking-wider">
        Top mover 24h
      </div>
      <button
        onClick={() => onSelect(best!.contract.id)}
        onPointerEnter={() => warmChart(best!.contract)}
        onFocus={() => warmChart(best!.contract)}
        className="hover:bg-canvas-50 -mx-1 flex items-baseline gap-1.5 rounded px-1 text-left font-mono text-lg font-semibold tabular-nums"
      >
        <span className="text-ink-900">{tickerOf(best.contract)}</span>
        <ChangeLabel change={best.change} className="text-lg font-semibold" />
      </button>
    </Col>
  )
}

const ChangeLabel = (props: {
  change: number | undefined
  className?: string
}) => {
  const { change, className } = props
  if (change === undefined)
    return <span className={clsx('text-ink-400', className)}>—</span>
  return (
    <span
      className={clsx(
        'font-mono tabular-nums',
        change > 0
          ? 'text-teal-600 dark:text-teal-400'
          : change < 0
          ? 'text-scarlet-600 dark:text-scarlet-400'
          : 'text-ink-500',
        className
      )}
    >
      {pct(change)}
    </span>
  )
}

// "▲ 62%": the heavier side of open interest and its share.
const LeanBadge = (props: { contract: PerpContract; className?: string }) => {
  const lean = leanOf(props.contract)
  if (!lean)
    return <span className={clsx('text-ink-400', props.className)}>—</span>
  const long = lean.dir === 'long'
  return (
    <Tooltip
      text={`${Math.round(lean.share * 100)}% of open interest is ${
        lean.dir
      } — traders are positioned for ${long ? 'up' : 'down'}`}
    >
      <span
        className={clsx(
          'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums',
          long
            ? 'bg-teal-500/10 text-teal-700 dark:text-teal-400'
            : 'bg-scarlet-500/10 text-scarlet-700 dark:text-scarlet-400',
          props.className
        )}
      >
        {long ? '▲' : '▼'} {Math.round(lean.share * 100)}%
      </span>
    </Tooltip>
  )
}

// Tiny polyline sparkline drawn from the shared hourly week series — no
// fetch of its own.
const MiniSpark = (props: {
  series: WeekSeries | undefined
  change: number | undefined
  className?: string
}) => {
  const { series, change, className } = props
  if (!series || series.length < 2)
    return <div className={clsx('bg-canvas-50 rounded', className)} />
  const xs = series.map((p) => p.ts)
  const ys = series.map((p) => p.price)
  const x0 = xs[0]
  const xr = xs[xs.length - 1] - x0 || 1
  const yMin = Math.min(...ys)
  const yr = Math.max(...ys) - yMin || 1
  const path = series
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${(((p.ts - x0) / xr) * 100).toFixed(2)},${(
          28 -
          ((p.price - yMin) / yr) * 24 -
          2
        ).toFixed(2)}`
    )
    .join(' ')
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className={clsx(
        change === undefined || change === 0
          ? 'text-ink-400'
          : change > 0
          ? 'text-teal-500'
          : 'text-scarlet-500',
        className
      )}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Pinned to the top while scrolling; the terminal's scroll-margin accounts
// for its height so ticker clicks land the chart just below it.
const TickerTape = (props: {
  contracts: PerpContract[]
  week: Record<string, WeekSeries>
  onSelect: (id: string) => void
}) => {
  const { contracts, week, onSelect } = props
  if (contracts.length === 0) return null
  const items = [...contracts, ...contracts]
  const duration = Math.max(24, contracts.length * 9)
  return (
    <div className="border-ink-200 dark:border-ink-300 bg-canvas-0 group sticky top-0 z-20 overflow-hidden whitespace-nowrap border-b">
      <style>{`
        @keyframes perps-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @media (prefers-reduced-motion: reduce) { .perps-marquee { animation: none !important } }
      `}</style>
      <div
        className="perps-marquee inline-block py-1.5 group-hover:[animation-play-state:paused]"
        style={{ animation: `perps-marquee ${duration}s linear infinite` }}
      >
        {items.map((c, i) => (
          <TickerItem
            key={c.id + i}
            contract={c}
            series={week[c.id]}
            onSelect={() => onSelect(c.id)}
          />
        ))}
      </div>
    </div>
  )
}

const TickerItem = (props: {
  contract: PerpContract
  series: WeekSeries | undefined
  onSelect: () => void
}) => {
  const { contract, series, onSelect } = props
  const price = Number(contract.oraclePrice)
  const flash = useTickFlash(price)
  const change = weekChange(series, contract)
  return (
    <button
      onClick={onSelect}
      onPointerEnter={() => warmChart(contract)}
      onFocus={() => warmChart(contract)}
      className="hover:bg-canvas-50 inline-flex items-center gap-2 px-4 text-sm"
    >
      <span className="text-ink-900 font-mono font-semibold">
        {tickerOf(contract)}
      </span>
      <span
        className={clsx(
          'text-ink-700 font-mono tabular-nums transition-colors duration-700',
          flash === 'up' && 'text-teal-500 duration-0',
          flash === 'down' && 'text-scarlet-500 duration-0'
        )}
      >
        {displayPrice(contract)}
      </span>
      {change !== undefined && (
        <ChangeLabel change={change} className="text-xs" />
      )}
      {leanOf(contract) && <LeanBadge contract={contract} />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Lean history. Funding events don't record open interest, but the funding
// rate is a pure function of the OI imbalance (common/perps/amm
// computeFundingRate), so each event's rate inverts exactly to the long
// share of open interest at that tick. That gives "which way was the money
// leaning" over time from data that already exists, in the one unit users
// actually read — no funding-rate chart needed.

// Inverse of computeFundingRate: magnitude m = |rate| / fMax, and with
// x = low/high, m = (1-x)/(1-x+kx)  =>  x = (1-m)/(1-m+mk); the heavier
// side's share is 1/(1+x). A zero rate means balanced (or no OI at all).
const longShareFromRate = (rate: number, k: number, fMax: number) => {
  if (!Number.isFinite(rate) || rate === 0 || !(fMax > 0) || !(k > 0))
    return 0.5
  const m = Math.min(Math.abs(rate) / fMax, 0.999999)
  const x = (1 - m) / (1 - m + m * k)
  const highShare = 1 / (1 + x)
  return rate > 0 ? highShare : 1 - highShare
}

const useLeanHistory = (contract: PerpContract) => {
  const [points, setPoints] = useState<
    { ts: number; longShare: number }[] | null
  >(null)
  useEffect(() => {
    let cancelled = false
    setPoints(null)
    api('get-perp-funding-events', {
      contractId: contract.id,
      since: Date.now() - 7 * DAY_MS,
      limit: 500,
    })
      .then((events) => {
        if (cancelled) return
        setPoints(
          events
            .filter((e) => Number.isFinite(e.ts))
            .map((e) => ({
              ts: e.ts,
              longShare: longShareFromRate(
                e.fundingRate,
                contract.fundingSensitivity,
                contract.maxFundingRate
              ),
            }))
            .sort((a, b) => a.ts - b.ts)
        )
      })
      .catch(() => {
        if (!cancelled) setPoints([])
      })
    return () => {
      cancelled = true
    }
  }, [contract.id, contract.fundingSensitivity, contract.maxFundingRate])
  return points
}

// Long share of open interest over the last week: a line around a 50%
// midline, teal above (net long), scarlet below (net short). Ends on the
// live lean so it agrees with the badge beside it.
const LeanHistory = (props: { contract: PerpContract; className?: string }) => {
  const { contract, className } = props
  const history = useLeanHistory(contract)
  const live = leanOf(contract)
  const points = useMemo(() => {
    const pts = history ? [...history] : []
    if (live) pts.push({ ts: Date.now(), longShare: live.longShare })
    return pts
  }, [history, live?.longShare])
  if (!history || points.length < 2) return null

  const W = 100
  const H = 32
  const x0 = points[0].ts
  const xr = points[points.length - 1].ts - x0 || 1
  const px = (p: { ts: number }) => ((p.ts - x0) / xr) * W
  const py = (p: { longShare: number }) => H - p.longShare * H
  const line = points
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${px(p).toFixed(2)},${py(p).toFixed(2)}`
    )
    .join(' ')
  const area = `${line} L${W},${H / 2} L0,${H / 2} Z`
  const id = `lean-${contract.id}`
  // Theme colors as SVG paint: the palette vars hold "r g b" triplets (see
  // tailwind.config), so they stay correct in dark mode.
  const yes = (shade: number) => `rgb(var(--color-yes-${shade}))`
  const no = (shade: number) => `rgb(var(--color-no-${shade}))`
  return (
    <Tooltip
      text="Share of open interest that is long, last 7 days. Above the line: net long. Below: net short."
      className={className}
    >
      <Col className="items-end gap-0.5">
        <div className="text-ink-500 text-xs">Lean, 7 days</div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-8 w-32 sm:w-36"
          aria-label="Long share of open interest over the last 7 days"
        >
          <defs>
            <clipPath id={`${id}-top`}>
              <rect x={0} y={0} width={W} height={H / 2} />
            </clipPath>
            <clipPath id={`${id}-bottom`}>
              <rect x={0} y={H / 2} width={W} height={H / 2} />
            </clipPath>
            {/* Vertical gradients in viewBox units: green fading in above
                the midline, red fading in below, so the color says which
                side AND how far. */}
            <linearGradient
              id={`${id}-stroke`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={0}
              y2={H}
            >
              <stop offset="0" stopColor={yes(600)} />
              <stop offset="0.42" stopColor={yes(400)} />
              <stop offset="0.5" stopColor="rgb(var(--color-ink-400))" />
              <stop offset="0.58" stopColor={no(400)} />
              <stop offset="1" stopColor={no(600)} />
            </linearGradient>
            <linearGradient
              id={`${id}-fill-top`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={0}
              y2={H / 2}
            >
              <stop offset="0" stopColor={yes(500)} stopOpacity={0.45} />
              <stop offset="1" stopColor={yes(500)} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient
              id={`${id}-fill-bottom`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={H / 2}
              x2={0}
              y2={H}
            >
              <stop offset="0" stopColor={no(500)} stopOpacity={0.04} />
              <stop offset="1" stopColor={no(500)} stopOpacity={0.45} />
            </linearGradient>
          </defs>
          <line
            x1={0}
            x2={W}
            y1={H / 2}
            y2={H / 2}
            className="stroke-ink-300"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray="2 2"
          />
          <path
            d={area}
            fill={`url(#${id}-fill-top)`}
            clipPath={`url(#${id}-top)`}
          />
          <path
            d={area}
            fill={`url(#${id}-fill-bottom)`}
            clipPath={`url(#${id}-bottom)`}
          />
          <path
            d={line}
            fill="none"
            stroke={`url(#${id}-stroke)`}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
      </Col>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Terminal: the selected market's chart, with trading folded away until asked
// for so the chart is the view.

const useOracleTradingPaused = (contract: PerpContract) => {
  // Client-only: Date.now() on the server would hydrate differently.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), POLL_MS)
    return () => clearInterval(id)
  }, [contract.oraclePriceTime])
  if (now == null || PERPS_SKIP_ORACLE_FRESHNESS) return false
  return (
    getOracleFreshness(
      contract.oraclePriceTime,
      contract.maxOraclePriceAgeMs,
      now
    ).status !== 'fresh'
  )
}

// On phones the card's gutter + border + padding cost the chart ~40px of a
// 360px screen. While the card is the thing on screen — it spans the
// upper-middle of the viewport — it slides out to the screen edges and the
// plot inside bleeds edge to edge; scrolling past it slides it back in.
// The band starts below the card's resting position on a fresh load so
// the page doesn't animate on mount.
const useMobileBleed = (ref: RefObject<HTMLElement>) => {
  const [bleed, setBleed] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const phone = window.matchMedia('(max-width: 639px)')
    let inBand = false
    const update = () => setBleed(inBand && phone.matches)
    const io = new IntersectionObserver(
      ([entry]) => {
        inBand = entry.isIntersecting
        update()
      },
      // Root shrinks to the 30%–40% band of the viewport height.
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    )
    io.observe(el)
    phone.addEventListener('change', update)
    return () => {
      io.disconnect()
      phone.removeEventListener('change', update)
    }
  }, [ref])
  return bleed
}

const Terminal = (props: {
  contract: PerpContract
  all: PerpContract[]
  week: WeekSeries | undefined
  onSelect: (id: string) => void
}) => {
  const { all, week, onSelect } = props
  const cardRef = useRef<HTMLDivElement>(null)
  const bleed = useMobileBleed(cardRef)
  const { contract, refresh, refreshKey } = useLivePerpContract(props.contract)
  const { positions, unsound: unsoundPositions } = usePerpPositions(
    contract.id,
    refreshKey
  )
  const [tradeOpen, setTradeOpen] = useState(false)
  const oracleTradingPaused = useOracleTradingPaused(contract)

  const price = Number(contract.oraclePrice)
  const flash = useTickFlash(price)
  const rate = getPerpFundingRate(contract)
  const periodMs = getFundingPeriodMs(contract)
  const hasOI =
    (contract.openInterestLong ?? 0) > 0 ||
    (contract.openInterestShort ?? 0) > 0
  const lean = leanOf(contract)
  const change = weekChange(week, contract)
  const dayChange = changeSince(week, contract, DAY_MS)
  // Countdown and "updated ago" are Date.now()-derived: client-only so the
  // server render can't hydrate against a different clock.
  const isClient = useIsClient()
  const nextFunding = isClient
    ? nextFundingTimes(
        contract.lastFundingTime,
        Date.now(),
        1,
        periodMs,
        contract.createdTime
      )[0]
    : undefined

  return (
    <Col
      id="perp-terminal"
      ref={cardRef}
      className={clsx(
        'border-ink-200 dark:border-ink-300 bg-canvas-0 scroll-mt-12 gap-4 border p-4 transition-[margin,border-radius] duration-300 ease-out sm:p-5',
        // rounded-xl sits after rounded-none in Tailwind's output, so the
        // two can't be stacked — pick one.
        bleed ? '-mx-3 rounded-none border-x-0' : 'rounded-xl'
      )}
    >
      {/* Below xl the watchlist sits under the chart, so give phones and
          tablets a switcher up here. */}
      <Row className="-mx-1 gap-1.5 overflow-x-auto px-1 pb-1 xl:hidden">
        {all.map((c) => {
          const active = c.id === contract.id
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              onPointerEnter={() => warmChart(c)}
              onFocus={() => warmChart(c)}
              className={clsx(
                'shrink-0 rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition-colors',
                active
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'border-ink-200 text-ink-600 hover:bg-canvas-50 dark:border-ink-300'
              )}
            >
              {tickerOf(c)}
            </button>
          )
        })}
      </Row>

      <Row className="flex-wrap items-start justify-between gap-3">
        <Col className="min-w-0 gap-1">
          <Row className="items-baseline gap-3">
            <span className="text-primary-600 dark:text-primary-400 font-mono text-xl font-bold">
              {tickerOf(contract)}
            </span>
            <span className="text-ink-900 truncate text-lg font-medium">
              {contract.question}
            </span>
          </Row>
          {lean && (
            <Row className="items-center gap-2 text-sm">
              <LeanBadge contract={contract} />
              <span className="text-ink-600">
                traders lean{' '}
                <span
                  className={clsx(
                    'font-semibold',
                    lean.dir === 'long'
                      ? 'text-teal-600 dark:text-teal-400'
                      : 'text-scarlet-600 dark:text-scarlet-400'
                  )}
                >
                  {lean.dir === 'long' ? 'up' : 'down'}
                </span>
              </span>
            </Row>
          )}
        </Col>
        <Link
          href={contractPath(contract)}
          className="text-primary-600 hover:text-primary-500 dark:text-primary-400 flex shrink-0 items-center gap-1 text-sm"
        >
          Full market page
          <ExternalLinkIcon className="h-4 w-4" />
        </Link>
      </Row>

      {/* Phones: a two-row grid — price · 24h · 7d over funding · lean —
          so nothing wraps onto a third line. From sm up the stats are one
          flex row with the lean sparkline pushed to the right; the inner
          Row dissolves (display: contents) below sm so its stats become
          grid cells directly. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        <Row className="flex-wrap items-baseline gap-x-5 gap-y-2 max-sm:contents sm:gap-x-8">
          <Col>
            <div className="text-ink-500 text-xs">Oracle price</div>
            <div
              className={clsx(
                'font-mono text-2xl font-semibold tabular-nums transition-colors duration-700 sm:text-3xl',
                flash === 'up' && 'text-teal-500 duration-0',
                flash === 'down' && 'text-scarlet-500 duration-0'
              )}
            >
              {displayPrice(contract)}
            </div>
            {isClient && typeof contract.oraclePriceTime === 'number' && (
              <div className="text-ink-400 text-xs">
                {/* Clamped: scheduler stamps can run a few seconds ahead of
                    the browser clock, which would read "in a few seconds". */}
                updated{' '}
                {fromNow(Math.min(contract.oraclePriceTime, Date.now()))}
              </div>
            )}
          </Col>
          <Col>
            <div className="text-ink-500 text-xs">24 hours</div>
            <ChangeLabel change={dayChange} className="text-xl font-semibold" />
          </Col>
          <Col>
            <div className="text-ink-500 text-xs">7 days</div>
            <ChangeLabel change={change} className="text-xl font-semibold" />
          </Col>
          <Col>
            <div className="text-ink-500 text-xs">Funding</div>
            {hasOI && rate !== 0 ? (
              <Tooltip
                text={`${
                  rate > 0 ? 'Longs pay shorts' : 'Shorts pay longs'
                } every ${fundingPeriodUnit(periodMs)} · annualized ${
                  rate > 0 ? '+' : ''
                }${(rate * (YEAR_MS / periodMs) * 100).toFixed(0)}%/yr`}
              >
                <div
                  className={clsx(
                    'font-mono text-xl font-semibold tabular-nums',
                    rate > 0
                      ? 'text-scarlet-600 dark:text-scarlet-400'
                      : 'text-teal-600 dark:text-teal-400'
                  )}
                >
                  {rate > 0 ? '+' : ''}
                  {(rate * 100).toFixed(3)}%
                  <span className="text-ink-400 text-sm font-normal">
                    /{fundingPeriodUnit(periodMs)}
                  </span>
                  <div className="text-ink-400 font-sans text-[11px] font-normal leading-4">
                    {rate > 0 ? 'longs pay' : 'shorts pay'}
                    {nextFunding !== undefined &&
                      ` · next in ${formatCountdown(nextFunding - Date.now())}`}
                  </div>
                </div>
              </Tooltip>
            ) : (
              <div className="text-ink-400 font-mono text-xl font-semibold">
                —
              </div>
            )}
          </Col>
        </Row>
        <LeanHistory
          contract={contract}
          className="max-sm:col-span-2 max-sm:self-end max-sm:justify-self-end"
        />
      </div>

      {oracleTradingPaused && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100"
        >
          Oracle update delayed — trading is paused until a fresh price arrives.
        </div>
      )}

      <PerpChart
        contract={contract}
        mode="price"
        positions={positions}
        plotClassName={clsx(
          'transition-[margin] duration-300 ease-out',
          bleed && '-mx-4'
        )}
      />
      <PerpOracleAttribution
        feedId={contract.oracleFeedId}
        asOfTime={contract.oracleSourceTime}
      />

      {tradeOpen ? (
        <Col className="gap-3">
          <Row className="items-center justify-between">
            <SectionHeader title={`Trade ${tickerOf(contract)}`} />
            <button
              className="text-ink-500 hover:text-ink-700 text-xs"
              onClick={() => setTradeOpen(false)}
            >
              Hide
            </button>
          </Row>
          <PerpBetPanel
            contract={contract}
            onTrade={refresh}
            positions={positions}
            unsoundPositions={unsoundPositions}
            oracleTradingPaused={oracleTradingPaused}
          />
        </Col>
      ) : (
        <Row className="gap-2">
          <button
            onClick={() => setTradeOpen(true)}
            className="flex-1 rounded-md bg-teal-600 py-2 font-semibold text-white hover:bg-teal-500"
          >
            Long ↑
          </button>
          <button
            onClick={() => setTradeOpen(true)}
            className="bg-scarlet-600 hover:bg-scarlet-500 flex-1 rounded-md py-2 font-semibold text-white"
          >
            Short ↓
          </button>
        </Row>
      )}
      <PerpPositionPanel
        contract={contract}
        onAction={refresh}
        refreshKey={refreshKey}
        positions={positions}
        oracleTradingPaused={oracleTradingPaused}
      />
    </Col>
  )
}

// ---------------------------------------------------------------------------
// Watchlist: every open perp, sortable, top rows only until expanded.

const Watchlist = (props: {
  contracts: PerpContract[]
  week: Record<string, WeekSeries>
  selectedId: string
  sort: { key: SortKey; desc: boolean }
  onSort: (key: SortKey) => void
  changeWindow: ChangeWindow
  onChangeWindow: (w: ChangeWindow) => void
  onSelect: (id: string) => void
}) => {
  const {
    contracts,
    week,
    selectedId,
    sort,
    onSort,
    changeWindow,
    onChangeWindow,
    onSelect,
  } = props
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? contracts : contracts.slice(0, DEFAULT_ROWS)
  const hidden = contracts.length - visible.length
  const header = { sort, onSort }

  return (
    <Col className="border-ink-200 dark:border-ink-300 bg-canvas-0 overflow-hidden rounded-xl border">
      <div
        className={clsx(
          WATCH_GRID,
          'border-ink-200 dark:border-ink-300 border-b px-3 py-2 text-[11px] font-medium'
        )}
      >
        <SortHeader {...header} label="Market" sortKey="volume" />
        <SortHeader {...header} label="Price" className="text-right" />
        {HUB_FEATURES.changeWindow ? (
          // The change column doubles as the window switch: click the
          // inactive window to switch to it (and sort by it), click the
          // active one to flip sort direction.
          <span className="flex justify-end gap-1.5">
            {(['24h', '7d'] as const).map((w) => {
              const isWindow = changeWindow === w
              const active = isWindow && sort.key === 'change'
              return (
                <button
                  key={w}
                  onClick={() => {
                    if (isWindow) onSort('change')
                    else {
                      onChangeWindow(w)
                      if (sort.key !== 'change') onSort('change')
                    }
                  }}
                  className={clsx(
                    'hover:text-ink-700 uppercase tracking-wider',
                    isWindow ? 'text-ink-800' : 'text-ink-400'
                  )}
                >
                  {w}
                  {active && (
                    <span className="ml-0.5 text-[9px]">
                      {sort.desc ? '▼' : '▲'}
                    </span>
                  )}
                </button>
              )
            })}
          </span>
        ) : (
          <SortHeader
            {...header}
            label="7d"
            sortKey="change"
            className="text-right"
          />
        )}
        <span className="hidden min-[360px]:block" />
        <SortHeader
          {...header}
          label="Lean"
          sortKey="lean"
          className="text-right"
        />
      </div>
      <Col className="divide-ink-200 dark:divide-ink-300 divide-y">
        {visible.map((c) => (
          <WatchRow
            key={c.id}
            contract={c}
            series={week[c.id]}
            changeWindow={changeWindow}
            selected={c.id === selectedId}
            onSelect={() => onSelect(c.id)}
          />
        ))}
      </Col>
      {(hidden > 0 || showAll) && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="text-ink-500 hover:bg-canvas-50 hover:text-ink-700 border-ink-200 dark:border-ink-300 border-t px-3 py-2 text-xs"
        >
          {showAll ? 'Show fewer' : `Show all ${contracts.length}`}
        </button>
      )}
    </Col>
  )
}

const SortHeader = (props: {
  label: string
  sortKey?: SortKey
  className?: string
  sort: { key: SortKey; desc: boolean }
  onSort: (key: SortKey) => void
}) => {
  const { label, sortKey, className, sort, onSort } = props
  const active = sortKey !== undefined && sort.key === sortKey
  const content = (
    <>
      {label}
      {active && (
        <span className="ml-0.5 text-[9px]">{sort.desc ? '▼' : '▲'}</span>
      )}
    </>
  )
  return sortKey ? (
    <button
      onClick={() => onSort(sortKey)}
      className={clsx(
        'hover:text-ink-700 uppercase tracking-wider',
        active ? 'text-ink-800' : 'text-ink-400',
        className
      )}
    >
      {content}
    </button>
  ) : (
    <span className={clsx('text-ink-400 uppercase tracking-wider', className)}>
      {content}
    </span>
  )
}

const WatchRow = (props: {
  contract: PerpContract
  series: WeekSeries | undefined
  changeWindow: ChangeWindow
  selected: boolean
  onSelect: () => void
}) => {
  const { contract, series, changeWindow, selected, onSelect } = props
  const price = Number(contract.oraclePrice)
  const flash = useTickFlash(price)
  const change = changeSince(series, contract, windowMs(changeWindow))
  return (
    // One aligned grid row per market — the header uses the same template,
    // so every column lines up like a table. The full question is the hover
    // title; the ticker is the label.
    <button
      onClick={onSelect}
      onPointerEnter={() => warmChart(contract)}
      onFocus={() => warmChart(contract)}
      aria-current={selected}
      title={contract.question}
      className={clsx(
        WATCH_GRID,
        'px-3 py-2 text-left transition-colors',
        selected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-canvas-50'
      )}
    >
      <span
        className={clsx(
          'truncate font-mono text-sm font-bold',
          selected ? 'text-primary-600 dark:text-primary-400' : 'text-ink-900'
        )}
      >
        {tickerOf(contract)}
      </span>
      <span
        className={clsx(
          'text-ink-900 truncate text-right font-mono text-sm tabular-nums transition-colors duration-700',
          flash === 'up' && 'text-teal-500 duration-0',
          flash === 'down' && 'text-scarlet-500 duration-0'
        )}
      >
        {displayPrice(contract)}
      </span>
      <ChangeLabel change={change} className="text-right text-xs" />
      <MiniSpark
        series={series}
        change={change}
        className="hidden h-6 w-14 min-[360px]:block"
      />
      <span className="flex justify-end">
        <LeanBadge contract={contract} />
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Related markets for the selected perp, with the create prompt.

const RelatedMarkets = (props: {
  perp: PerpContract
  markets: Contract[] | undefined
  perpIds: Set<string>
}) => {
  const { perp, markets, perpIds } = props
  const topics = perp.groupSlugs ?? []
  const picks = (markets ?? [])
    .filter(
      (c) =>
        !perpIds.has(c.id) &&
        c.mechanism !== 'perp' &&
        !c.isResolved &&
        !isNearCertain(c)
    )
    .slice(0, 6)
  const hydrated = useAnswersFor(picks)
  const primaryTopic =
    topics.find((t) => !t.endsWith('-default')) ?? topics[0] ?? 'this'
  const createUrl =
    '/create?params=' +
    encodeURIComponent(
      JSON.stringify({ groupSlugs: topics, rand: perp.id.slice(0, 6) })
    )
  return (
    <Col className="border-ink-200 dark:border-ink-300 bg-canvas-0 overflow-hidden rounded-xl border">
      <Row className="border-ink-200 dark:border-ink-300 items-baseline gap-2 border-b px-3 py-2">
        <span className="text-ink-400 text-[11px] font-medium uppercase tracking-wider">
          Related
        </span>
        <span className="text-primary-600 dark:text-primary-400 font-mono text-xs font-bold">
          {tickerOf(perp)}
        </span>
        <span className="text-ink-500 truncate text-xs">
          {topics.slice(0, 3).map(topicLabel).join(' · ')}
        </span>
      </Row>
      <Col className="divide-ink-200 dark:divide-ink-300 divide-y">
        {markets === undefined ? (
          <Col className="gap-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-canvas-50 h-5 animate-pulse rounded" />
            ))}
          </Col>
        ) : picks.length === 0 ? (
          <div className="text-ink-400 p-3 text-sm">
            No related markets yet.
          </div>
        ) : (
          picks.map((c) => (
            <Link
              key={c.id}
              href={contractPath(c)}
              className="hover:bg-canvas-50 flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="text-ink-700 line-clamp-2 text-sm">
                {c.question}
              </span>
              <RelatedStat contract={hydrated[c.id] ?? c} />
            </Link>
          ))
        )}
      </Col>
      <Link
        href={createUrl}
        className="text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20 border-ink-200 dark:border-ink-300 flex items-center justify-center gap-1 border-t px-3 py-2 text-sm font-medium"
      >
        <PlusIcon className="h-4 w-4" />
        Create a market about {topicLabel(primaryTopic)}
      </Link>
    </Col>
  )
}

// Binary markets get the usual %; multiple-choice markets show the leading
// answer and its chance, which says more in a one-line row than a stacked
// bar would. Falls back to the shared status label for everything else.
const RelatedStat = (props: { contract: Contract }) => {
  const { contract } = props
  if (contract.outcomeType === 'MULTIPLE_CHOICE') {
    // Ladder markets ("Bitcoin price in 2026?") carry answers that already
    // resolved YES at 100%; the live question is the top answer still open.
    const answers = answersOf(contract)?.filter((a) => !a.resolution)
    if (!answers?.length)
      return <span className="text-ink-400 shrink-0 text-xs">multi</span>
    const top = [...answers].sort((a, b) => b.prob - a.prob)[0]
    return (
      <span className="flex max-w-[45%] shrink-0 items-baseline gap-1.5">
        <span className="text-ink-500 truncate text-xs">{top.text}</span>
        <span className="text-ink-900 text-sm font-semibold">
          {Math.round(top.prob * 100)}%
        </span>
      </span>
    )
  }
  return (
    <ContractStatusLabel
      contract={contract}
      className="shrink-0 text-sm font-semibold"
    />
  )
}

// ---------------------------------------------------------------------------
// Suggest a perpetual market: name + optional data source, one upvote per
// user. The list is what the team pulls from when picking the next launch.

// The list opens with a short preview; the rest is one click and one request
// away.
const SUGGESTIONS_PREVIEW = 5

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s)
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// One row of the list. The moderation controls are opt-in props, so a
// signed-out reader renders exactly the markup they did before.
const SuggestionRow = (props: {
  suggestion: PerpSuggestion
  onVote: (s: PerpSuggestion) => void
  onHide?: (s: PerpSuggestion) => void
  onUnhide?: (s: PerpSuggestion) => void
}) => {
  const { suggestion: s, onVote, onHide, onUnhide } = props
  return (
    <Row className="items-center gap-3 px-4 py-2">
      <button
        onClick={() => onVote(s)}
        aria-pressed={s.hasVoted}
        aria-label={s.hasVoted ? 'Remove upvote' : 'Upvote'}
        // The vote endpoint refuses hidden rows; don't offer the click.
        disabled={s.hidden}
        className={clsx(
          'flex w-12 shrink-0 flex-col items-center rounded-md border py-1 font-mono text-xs font-semibold leading-tight transition-colors',
          s.hidden
            ? 'border-ink-200 text-ink-400 dark:border-ink-300'
            : s.hasVoted
            ? 'border-primary-500 bg-primary-500 text-white'
            : 'border-ink-200 text-ink-600 hover:bg-canvas-50 dark:border-ink-300'
        )}
      >
        <span>▲</span>
        <span>{s.votes}</span>
      </button>
      <Col className="min-w-0 flex-1">
        <span
          className={clsx(
            'truncate text-sm font-medium',
            s.hidden ? 'text-ink-500' : 'text-ink-900'
          )}
        >
          {s.name}
        </span>
        {s.dataSource &&
          (isUrl(s.dataSource) ? (
            <a
              href={s.dataSource}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-400 hover:text-primary-500 truncate text-xs"
            >
              {hostOf(s.dataSource)}
            </a>
          ) : (
            <span className="text-ink-400 truncate text-xs">
              {s.dataSource}
            </span>
          ))}
      </Col>
      {onHide && (
        <Tooltip
          text="Hide from the list"
          placement="left"
          className="shrink-0"
        >
          <button
            onClick={() => onHide(s)}
            aria-label={`Hide "${s.name}"`}
            className="text-ink-300 hover:text-scarlet-500 rounded p-1 transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
      {onUnhide && (
        <button
          onClick={() => onUnhide(s)}
          className="text-ink-500 hover:text-primary-500 shrink-0 rounded px-1 py-1 text-xs transition-colors"
        >
          Unhide
        </button>
      )}
    </Row>
  )
}

const Suggestions = () => {
  const user = useUser()
  const isMod = !!user && (isAdminId(user.id) || isModId(user.id))
  // Declared before the fetch because it picks the page size.
  const [showAll, setShowAll] = useState(false)
  const {
    data,
    error: loadError,
    setData,
    refresh,
  } = useAPIGetter('get-perp-suggestions', {
    // The page opens with a preview and only pays for the rest when asked.
    // One row past the preview is fetched so the button knows there is more
    // without loading the list to find out. Mods take the whole list either
    // way — the hidden drawer's count has to be right.
    limit: showAll || isMod ? 100 : SUGGESTIONS_PREVIEW + 1,
    // Mods get the moderated rows back in the same response, tagged, and
    // split out below — no second request, and the count is known up front.
    includeHidden: isMod || undefined,
  })
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  // Moderation state: the row awaiting confirmation, and whether the hidden
  // drawer is open.
  const [pendingHide, setPendingHide] = useState<PerpSuggestion>()
  const [hiding, setHiding] = useState(false)
  const [hideError, setHideError] = useState<string>()
  const [showHidden, setShowHidden] = useState(false)

  const submit = async () => {
    if (!user) {
      firebaseLogin()
      return
    }
    setSubmitting(true)
    setError(undefined)
    try {
      await api('create-perp-suggestion', {
        name,
        dataSource: source.trim() || undefined,
      })
      setName('')
      setSource('')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const vote = async (s: PerpSuggestion) => {
    if (!user) {
      firebaseLogin()
      return
    }
    const remove = s.hasVoted
    // Optimistic flip; the refresh below reconciles.
    setData((prev) =>
      prev?.map((x) =>
        x.id === s.id
          ? { ...x, hasVoted: !remove, votes: x.votes + (remove ? -1 : 1) }
          : x
      )
    )
    try {
      await api('vote-perp-suggestion', { suggestionId: s.id, remove })
    } finally {
      refresh()
    }
  }

  const setHidden = async (s: PerpSuggestion, hide: boolean) => {
    setHiding(true)
    setHideError(undefined)
    try {
      await api('hide-perp-suggestion', { suggestionId: s.id, hide })
      setData((prev) =>
        prev?.map((x) => (x.id === s.id ? { ...x, hidden: hide } : x))
      )
      setPendingHide(undefined)
      refresh()
    } catch (e) {
      setHideError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setHiding(false)
    }
  }

  // Only a mod's response carries hidden rows at all, so this split is a
  // no-op for everyone else.
  const all = data ?? []
  const list = all.filter((s) => !s.hidden)
  const hiddenList = all.filter((s) => s.hidden)
  const visible = showAll ? list : list.slice(0, SUGGESTIONS_PREVIEW)

  return (
    <Col id="perps-suggest" className="scroll-mt-4 gap-3">
      <SectionHeader title="Suggest a perpetual market" />
      <div className="border-ink-200 dark:border-ink-300 bg-canvas-0 grid grid-cols-1 gap-0 overflow-hidden rounded-xl border lg:grid-cols-5">
        <Col className="border-ink-200 dark:border-ink-300 gap-3 border-b p-4 lg:col-span-2 lg:border-b-0 lg:border-r">
          <div className="text-ink-900 font-semibold">
            What would you trade?
          </div>
          <p className="text-ink-600 text-sm">
            We can only launch a perp on a number we can measure reliably. The
            suggestions with the best shot come with a free, public data source
            that updates at least hourly — an API, or a page we can read without
            logging in.
          </p>
          <Col className="gap-1">
            <label htmlFor="perp-suggest-name" className="text-ink-500 text-xs">
              Market name
            </label>
            <Input
              id="perp-suggest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. US 10-year Treasury yield"
              maxLength={80}
              className="w-full"
            />
          </Col>
          <Col className="gap-1">
            <label
              htmlFor="perp-suggest-source"
              className="text-ink-500 text-xs"
            >
              Data source <span className="text-ink-400">(optional)</span>
            </label>
            <Input
              id="perp-suggest-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Link to a free source that updates often"
              maxLength={300}
              className="w-full"
            />
          </Col>
          {error && <div className="text-scarlet-500 text-sm">{error}</div>}
          <Button
            color="indigo"
            size="sm"
            disabled={submitting || name.trim().length < 3}
            onClick={submit}
          >
            {user ? 'Suggest it' : 'Sign in to suggest'}
          </Button>
        </Col>
        <Col className="lg:col-span-3">
          <Row className="border-ink-200 dark:border-ink-300 items-baseline justify-between border-b px-4 py-2">
            <span className="text-ink-400 text-[11px] font-medium uppercase tracking-wider">
              Suggested
            </span>
            <span className="text-ink-400 text-xs">
              Upvote what you'd trade
            </span>
          </Row>
          <Col className="divide-ink-200 dark:divide-ink-300 divide-y">
            {data === undefined && loadError ? (
              <div className="text-ink-400 p-4 text-sm">
                Suggestions are unavailable right now.
              </div>
            ) : data === undefined ? (
              <Col className="gap-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="bg-canvas-50 h-5 animate-pulse rounded"
                  />
                ))}
              </Col>
            ) : list.length === 0 ? (
              <div className="text-ink-400 p-4 text-sm">
                Nothing suggested yet — be the first.
              </div>
            ) : (
              visible.map((s) => (
                <SuggestionRow
                  key={s.id}
                  suggestion={s}
                  onVote={vote}
                  onHide={isMod ? setPendingHide : undefined}
                />
              ))
            )}
          </Col>
          {list.length > visible.length || showAll ? (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-ink-500 hover:bg-canvas-50 hover:text-ink-700 border-ink-200 dark:border-ink-300 border-t px-3 py-2 text-xs"
            >
              {showAll ? 'Show fewer' : 'Show more'}
            </button>
          ) : null}
          {isMod && hiddenList.length > 0 && (
            <Col className="border-ink-200 dark:border-ink-300 border-t">
              <button
                onClick={() => setShowHidden((v) => !v)}
                className="text-ink-400 hover:bg-canvas-50 hover:text-ink-600 px-3 py-2 text-left text-xs"
              >
                {hiddenList.length} hidden {showHidden ? '▾' : '▸'}
              </button>
              {showHidden && (
                <Col className="divide-ink-200 dark:divide-ink-300 bg-canvas-50 border-ink-200 dark:border-ink-300 divide-y border-t">
                  {hiddenList.map((s) => (
                    <SuggestionRow
                      key={s.id}
                      suggestion={s}
                      onVote={vote}
                      onUnhide={(x) => setHidden(x, false)}
                    />
                  ))}
                  {hideError && !pendingHide && (
                    <div className="text-scarlet-500 px-4 py-2 text-xs">
                      {hideError}
                    </div>
                  )}
                </Col>
              )}
            </Col>
          )}
        </Col>
      </div>
      <Modal
        open={!!pendingHide}
        setOpen={(open) => {
          if (!open) {
            setPendingHide(undefined)
            setHideError(undefined)
          }
        }}
      >
        <Col className={clsx(MODAL_CLASS, '!items-start')}>
          <div className="text-ink-900 text-lg font-semibold">
            Hide this suggestion?
          </div>
          <p className="text-ink-600 text-sm">
            <span className="text-ink-900 font-medium">
              {pendingHide?.name}
            </span>{' '}
            comes off the public list. Its{' '}
            {pendingHide?.votes === 1
              ? '1 upvote is'
              : `${pendingHide?.votes ?? 0} upvotes are`}{' '}
            kept, and you can restore it from the hidden list underneath.
          </p>
          {hideError && (
            <div className="text-scarlet-500 text-sm">{hideError}</div>
          )}
          <Row className="w-full justify-end gap-3">
            <Button
              color="gray-white"
              onClick={() => setPendingHide(undefined)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={hiding}
              onClick={() => pendingHide && setHidden(pendingHide, true)}
            >
              Hide it
            </Button>
          </Row>
        </Col>
      </Modal>
    </Col>
  )
}

// The market page's own explainer (single source of truth, via
// PerpExplainerContent) next to the selected market's actual parameters —
// the abstract rules on the left, what they mean for THIS market on the
// right.
const Explainer = (props: { contract: PerpContract | undefined }) => {
  const { contract } = props
  return (
    <Col id="perps-explainer" className="scroll-mt-12 gap-3">
      <SectionHeader title="What are perps?" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Col className="border-ink-200 dark:border-ink-300 bg-canvas-0 gap-4 rounded-xl border p-4 sm:p-5">
          <PerpExplainerContent hideHeading />
        </Col>
        {contract && <MarketParameters contract={contract} />}
      </div>
    </Col>
  )
}

const MarketParameters = (props: { contract: PerpContract }) => {
  const { contract } = props
  const maxLev = contract.maxLeverage
  const periodMs = getFundingPeriodMs(contract)
  const feeBps = getPerpTakerFeeBps(contract)
  const rows: { label: string; value: string; note: string }[] = [
    {
      label: 'Max leverage',
      value: `${maxLev}×`,
      note: `At ${maxLev}×, a ${(100 / maxLev).toFixed(
        maxLev >= 50 ? 1 : 0
      )}% move against you liquidates the position. Lower leverage, more room.`,
    },
    {
      label: 'Fee',
      value: `${(feeBps / 100).toFixed(2)}%`,
      note: 'Of position size, charged once when you open or add. Closing is free. Fees go into the market’s backing, not to Manifold.',
    },
    {
      label: 'Funding',
      value: `every ${fundingPeriodNoun(periodMs)}`,
      note: 'The more crowded side pays the other. The current rate and the next payment are shown above the chart.',
    },
    {
      label: 'Oracle',
      value: `pauses after ${formatCountdown(contract.maxOraclePriceAgeMs)}`,
      note: 'Trades execute at the latest accepted oracle price. If the feed goes quiet for longer than this, opening and closing pause until it recovers.',
    },
  ]
  return (
    <Col className="border-ink-200 dark:border-ink-300 bg-canvas-0 overflow-hidden rounded-xl border">
      <Row className="border-ink-200 dark:border-ink-300 items-baseline gap-2 border-b px-4 py-2.5">
        <span className="text-ink-400 text-[11px] font-medium uppercase tracking-wider">
          This market
        </span>
        <span className="text-primary-600 dark:text-primary-400 font-mono text-xs font-bold">
          {tickerOf(contract)}
        </span>
      </Row>
      <Col className="divide-ink-200 dark:divide-ink-300 divide-y">
        {rows.map((r) => (
          <Col key={r.label} className="gap-0.5 px-4 py-3">
            <Row className="items-baseline justify-between gap-3">
              <span className="text-ink-900 text-sm font-semibold">
                {r.label}
              </span>
              <span className="text-ink-900 font-mono text-sm tabular-nums">
                {r.value}
              </span>
            </Row>
            <p className="text-ink-500 text-xs">{r.note}</p>
          </Col>
        ))}
        <div className="px-4 py-3">
          <PerpOracleAttribution feedId={contract.oracleFeedId} />
        </div>
      </Col>
    </Col>
  )
}
