import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { PerpContract } from 'common/contract'
import {
  carryNeutralPath,
  clusterLiquidationBands,
  getDataGapFlags,
  LiquidationBand,
  nextFundingTimes,
  personalBreakEvenPath,
  ProjectionPoint,
  projectionHorizonWithFunding,
  realizedVolPerSqrtMs,
  volConePaths,
} from 'common/perps/chart-projections'
import {
  fundingPeriodNoun,
  fundingPeriodUnit,
  getFundingPeriodMs,
  getPerpFundingRate,
} from 'common/perps/funding'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { TokenNumber } from 'web/components/widgets/token-number'
import { median } from 'common/util/math'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { api } from 'web/lib/api/api'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { useUser } from 'web/hooks/use-user'

// numLiquidations / ghost only carry meaning in funding mode: liq counts
// annotate a transfer, and the ghost is the current period accruing at
// the live rate (not yet a transfer). Price mode ignores both.
type Point = {
  ts: number
  value: number
  numLiquidations?: number
  ghost?: boolean
}

type OpenPosition = {
  userId: string
  direction: 'long' | 'short'
  size: number
  costBasis: number
  originalCostBasis: number
  takerFeeCostBasis?: number
  entryPrice: number
  leverage: number
  liquidationPrice: number
}

// Forward-projection overlays on the price chart. The price is an external
// oracle, so none of these are forecasts: carry is the funding break-even
// hurdle, the cone is the feed's own realized volatility, and the rest are
// position levels. Toggles persist across markets for the session but reset
// on a fresh page load: every overlay is opt-in, so the chart always opens
// as just the price and a visitor adds analyst tools deliberately.
type OverlayKey = 'carry' | 'cone' | 'liqs' | 'you'
type OverlayToggles = { [k in OverlayKey]: boolean }
const DEFAULT_OVERLAYS: OverlayToggles = {
  carry: false,
  cone: false,
  liqs: false,
  you: false,
}

// Each frame fetches its own window server-side. Short frames take raw
// points; longer frames downsample via bucketSeconds (last point per
// bucket) so a fast feed's week/month views aren't truncated to "the last
// two days" by the 5000-point response cap.
//
// The cap is the binding constraint and it fails SILENTLY — the query is
// `order by ts desc limit 5000`, so an over-budget frame returns the newest
// 5000 points and renders a window shorter than its own label. Every frame
// must therefore stay under it at the FASTEST cadence any feed runs, which
// since 2026-08-17 is the BTC feed's 5s poll (was 15s):
//   15M  raw            15min/5s   =   180
//   1H   raw             1h/5s     =   720
//   6H   15s buckets     6h/15s    = 1,440   (raw would be 4,320 — 86% of
//                                             the cap, and climbing on any
//                                             feed faster than 5s)
//   1D   30s buckets    24h/30s    = 2,880
//   1W   5min buckets    7d/5min   = 2,016
//   1M   20min buckets  30d/20min  = 2,160
//   ALL  2h buckets                = up to ~13 months
// Buckets ≥ a feed's cadence pass its points through untouched, so bucketing
// a frame costs slow feeds nothing. 1W/1M matter for slow feeds specifically:
// on a 30-min feed the readable view — each day's wave distinct — lives at
// the weeks scale. 15M matters for fast ones: at 5s the mark steps visibly
// within it, which is the whole point of a fast poll. Cadence gating (below)
// keeps 15M off feeds too slow to fill it, with no per-feed special-casing.
type Timeframe = '15M' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL'
const TIMEFRAMES: Timeframe[] = ['15M', '1H', '6H', '1D', '1W', '1M', 'ALL']
const TIMEFRAME_MS: { [k in Timeframe]: number } = {
  '15M': 15 * MINUTE_MS,
  '1H': HOUR_MS,
  '6H': 6 * HOUR_MS,
  '1D': DAY_MS,
  '1W': 7 * DAY_MS,
  '1M': 30 * DAY_MS,
  ALL: Infinity,
}
const TIMEFRAME_FETCH: {
  [k in Timeframe]: { windowMs?: number; bucketSeconds?: number }
} = {
  '15M': { windowMs: 15 * MINUTE_MS },
  '1H': { windowMs: HOUR_MS },
  '6H': { windowMs: 6 * HOUR_MS, bucketSeconds: 15 },
  '1D': { windowMs: DAY_MS, bucketSeconds: 30 },
  '1W': { windowMs: 7 * DAY_MS, bucketSeconds: 300 },
  '1M': { windowMs: 30 * DAY_MS, bucketSeconds: 1200 },
  ALL: { bucketSeconds: 7200 },
}
// A frame needs enough points to draw a real line — a 30-min feed has 2-3
// points in an hour, and a two-point "chart" is junk. Cadence gating (in
// the component) keeps such frames unselectable; the fetch-time fallback
// covers data gaps the cadence can't predict.
const MIN_FRAME_POINTS = 4
// 1D is the landing frame: today's wave with live ticks visible, and a
// projection horizon (span × 0.28 ≈ 6.7h) short enough that the funding
// diamonds draw on the hold-cost line. On All the horizon spans weeks and
// the diamond guard (rightly) suppresses them; slow feeds that starve a
// one-day window fall back to All automatically.
const DEFAULT_TIMEFRAME: Timeframe = '1D'
// Fraction of the current price within which a liquidation price counts as
// "close", for the summary line under the Liquidations overlay.
const LIQ_PROXIMITY_BAND = 0.03

// ---------------------------------------------------------------------------
// Series cache. A hub page that swaps the mounted contract re-runs the
// cadence probe and the frame fetch on every switch — a visible
// "Loading chart…" even when switching back to a market seen seconds ago.
// Resolved responses are kept for a short TTL keyed by feed and frame, and
// the component reads them synchronously on mount, so a cached switch draws
// on the first paint. `prefetchPerpChart` primes the cache. Live ticks are
// appended on top of the fetched series regardless, so a slightly stale
// series is never stale on screen.
type SeriesPoint = { ts: number; price: number }
const SERIES_CACHE_TTL_MS = 5 * MINUTE_MS
const seriesCache = new Map<string, { at: number; points: SeriesPoint[] }>()
const seriesInflight = new Map<string, Promise<SeriesPoint[]>>()
// Only successful probes are cached; a null (too few points) is cheap to
// re-ask and may resolve once the feed has history.
const cadenceCache = new Map<string, number>()

const seriesKey = (feedId: string, frame: Timeframe) => `${feedId}|${frame}`

const getCachedSeries = (feedId: string, frame: Timeframe) => {
  const hit = seriesCache.get(seriesKey(feedId, frame))
  return hit && Date.now() - hit.at < SERIES_CACHE_TTL_MS ? hit.points : null
}

// `revalidate` skips the cache READ (still dedupes against an in-flight
// request and still writes the result back) — for painting a cached series
// immediately and then replacing it with fresh history.
const fetchFrameSeries = (
  feedId: string,
  frame: Timeframe,
  opts?: { revalidate?: boolean }
): Promise<SeriesPoint[]> => {
  const key = seriesKey(feedId, frame)
  if (!opts?.revalidate) {
    const cached = getCachedSeries(feedId, frame)
    if (cached) return Promise.resolve(cached)
  }
  const inflight = seriesInflight.get(key)
  if (inflight) return inflight
  const { windowMs, bucketSeconds } = TIMEFRAME_FETCH[frame]
  // Align `since` to the frame's bucket (a minute for raw frames): a
  // millisecond bound makes every request a unique URL that the edge cache
  // can never serve twice, and the series is bucketed at that grain anyway.
  const step = Math.max((bucketSeconds ?? 0) * 1000, MINUTE_MS)
  const request = api('get-oracle-price-series', {
    feedId,
    limit: 5000,
    since: windowMs
      ? Math.floor((Date.now() - windowMs) / step) * step
      : undefined,
    bucketSeconds,
  })
    .then((res) => {
      const points = res.filter(
        (p) => Number.isFinite(p.ts) && Number.isFinite(p.price) && p.price > 0
      )
      seriesCache.set(key, { at: Date.now(), points })
      return points
    })
    .finally(() => seriesInflight.delete(key))
  seriesInflight.set(key, request)
  return request
}

const probeCadence = (feedId: string): Promise<number | null> => {
  const cached = cadenceCache.get(feedId)
  if (cached !== undefined) return Promise.resolve(cached)
  return api('get-oracle-price-series', { feedId, limit: 8 })
    .then((res) => {
      if (res.length < 2) return null
      const dts = res.slice(1).map((p, i) => p.ts - res[i].ts)
      const m = median(dts)
      const cadence = Number.isFinite(m) && m > 0 ? m : null
      if (cadence !== null) cadenceCache.set(feedId, cadence)
      return cadence
    })
    .catch(() => null)
}

const frameEligibleFor = (
  frame: Timeframe,
  cadenceMs: number | null | undefined
) =>
  frame === 'ALL' ||
  (typeof cadenceMs === 'number' &&
    TIMEFRAME_MS[frame] / cadenceMs >= MIN_FRAME_POINTS)

/**
 * Warm the cadence probe and the landing-frame series for a contract so a
 * later mount of PerpChart draws without a loading state. Safe to call for
 * every market on a hub page; in-flight requests are shared with any chart
 * already fetching the same thing.
 */
export const prefetchPerpChart = async (contract: PerpContract) => {
  const feedId = contract.oracleFeedId
  if (!feedId) return
  const cadence = await probeCadence(feedId)
  const frame = frameEligibleFor(DEFAULT_TIMEFRAME, cadence)
    ? DEFAULT_TIMEFRAME
    : 'ALL'
  const points = await fetchFrameSeries(feedId, frame)
  if (points.length < MIN_FRAME_POINTS && frame !== 'ALL') {
    await fetchFrameSeries(feedId, 'ALL')
  }
}

type OverlayGeometry = {
  now: number
  horizon: number
  carry: ProjectionPoint[]
  // Upcoming funding transfers, positioned on the carry line.
  fundingMarks: ProjectionPoint[]
  cone: { upper: ProjectionPoint[]; lower: ProjectionPoint[] } | null
  liqBands: LiquidationBand[]
  yours: {
    direction: 'long' | 'short'
    entryPrice: number
    liquidationPrice: number
    breakEven: ProjectionPoint[]
  }[]
}

export const PerpChart = (props: {
  contract: PerpContract
  mode: 'price' | 'funding'
  height?: number
  // Shared polled positions from the parent (usePerpPositions): liquidation
  // bands cluster everyone's liq prices, and the user's own rows drive the
  // your-position lines. Null while loading.
  positions?: OpenPosition[] | null
  // Extra classes for the plot container only (not the chip row above or
  // the captions below) — the perps hub uses it to bleed the plot to the
  // screen edges on phones.
  plotClassName?: string
}) => {
  const { contract, mode, height = 240, positions, plotClassName } = props
  const user = useUser()
  const [fundingPoints, setFundingPoints] = useState<Point[]>([])
  const [livePoints, setLivePoints] = useState<Point[]>([])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [hoveredMark, setHoveredMark] = useState<ProjectionPoint | null>(null)
  const [hoveredCarryEnd, setHoveredCarryEnd] = useState(false)
  const [overlays, setOverlays] = usePersistentInMemoryState<OverlayToggles>(
    DEFAULT_OVERLAYS,
    'perp-chart-overlays'
  )
  const [timeframe, setTimeframe] = usePersistentInMemoryState<Timeframe>(
    DEFAULT_TIMEFRAME,
    'perp-chart-timeframe'
  )
  // The feed's true tick cadence, probed from its most recent raw points.
  // Frames fetch server-side windows, so eligibility can't be read off the
  // loaded (bucketed) series, and maxOraclePriceAgeMs is no proxy — it
  // carries hours of slack on slow feeds. One tiny raw fetch per contract
  // answers it exactly.
  // undefined = probe in flight; null = unavailable. Waiting for the probe
  // prevents a persisted short frame from firing a wasteful All request
  // before we know whether that frame is valid for this feed.
  const [cadenceMs, setCadenceMs] = useState<number | null | undefined>(() =>
    cadenceCache.get(contract.oracleFeedId)
  )
  useEffect(() => {
    let cancelled = false
    setCadenceMs(cadenceCache.get(contract.oracleFeedId))
    probeCadence(contract.oracleFeedId).then((cadence) => {
      if (!cancelled) setCadenceMs(cadence)
    })
    return () => {
      cancelled = true
    }
  }, [contract.oracleFeedId])
  // Seed from the cache so a remount of an already-fetched feed and frame
  // paints the series immediately instead of a loading placeholder.
  const initialCached = getCachedSeries(
    contract.oracleFeedId,
    frameEligibleFor(timeframe, cadenceMs) ? timeframe : 'ALL'
  )
  const [oraclePoints, setOraclePoints] = useState<Point[]>(
    () => initialCached?.map((p) => ({ ts: p.ts, value: p.price })) ?? []
  )
  const [loading, setLoading] = useState(!initialCached)
  // A frame is offered only when the feed's cadence puts enough points in
  // its window to draw a real line — a 30-min feed has 2-3 points in an
  // hour, and a two-point "chart" is junk. Until the probe answers (or if
  // it fails) only All is offered. The fetch below keys on the fallback,
  // not the raw selection, so a frame persisted from a faster market never
  // strands a slow one on a near-empty window.
  const frameEligible = (f: Timeframe) =>
    f === 'ALL' ||
    (typeof cadenceMs === 'number' &&
      TIMEFRAME_MS[f] / cadenceMs >= MIN_FRAME_POINTS)
  const activeFrame = frameEligible(timeframe) ? timeframe : 'ALL'
  const svgRef = useRef<SVGSVGElement | null>(null)
  // Responsive: viewBox width tracks the container so axis text renders at
  // its nominal size on every screen instead of scaling down to ~6px at
  // phone widths.
  const { elemRef: containerRef, width: measuredWidth } = useMeasureSize()

  // Live rate from the current open interest, not the per-funding-event-
  // refreshed contract.fundingRate — same rationale as perp-overview.tsx.
  const liveFundingRate = getPerpFundingRate(contract)
  // Frozen at create from the feed's cadence; hourly on legacy contracts.
  // Everything time-denominated on this chart (projections, diamond gating,
  // axis/hover units) keys off it.
  const fundingPeriodMs = getFundingPeriodMs(contract)
  const [chartNow, setChartNow] = useState(() => Date.now())
  useEffect(() => {
    setChartNow(Date.now())
    const id = setInterval(() => setChartNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [contract.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setHoverIdx(null)
    if (mode === 'price' && cadenceMs === undefined) {
      return () => {
        cancelled = true
      }
    }
    if (mode === 'price') {
      const feedId = contract.oracleFeedId
      const cached = getCachedSeries(feedId, activeFrame)
      if (
        cached &&
        (cached.length >= MIN_FRAME_POINTS || activeFrame === 'ALL')
      ) {
        // Cache hit: set data and clear loading in the same effect so React
        // batches them and never commits a loading render — then revalidate.
        // A series cached minutes ago (e.g. by the hub's prefetch) is missing
        // every tick since; the live-tick merge only appends the CURRENT
        // price, so without a refetch the gap would draw as one fabricated
        // straight segment. Fresh history replaces the cached one wholesale
        // and the live merge re-derives from its last point.
        setOraclePoints(cached.map((p) => ({ ts: p.ts, value: p.price })))
        setLoading(false)
        fetchFrameSeries(feedId, activeFrame, { revalidate: true })
          .then((points) => {
            if (cancelled) return
            if (points.length >= MIN_FRAME_POINTS || activeFrame === 'ALL') {
              setOraclePoints(points.map((p) => ({ ts: p.ts, value: p.price })))
            }
          })
          .catch(() => {})
      } else {
        setOraclePoints([])
        fetchFrameSeries(feedId, activeFrame)
          .then(async (validPoints) => {
            // Cadence gating keeps systematically-starved frames unselectable,
            // but a data gap (feed outage, freshly created feed) can still
            // empty an eligible window. Refetching All keeps the series
            // populated so the All view — and the sparse window itself —
            // still have something honest to draw.
            const fellBack =
              validPoints.length < MIN_FRAME_POINTS && activeFrame !== 'ALL'
            const points = fellBack
              ? await fetchFrameSeries(feedId, 'ALL')
              : validPoints
            if (cancelled) return
            setOraclePoints(points.map((p) => ({ ts: p.ts, value: p.price })))
            // Keep the selected control honest: once the short window falls
            // back to all history, label it All and stop re-filtering the
            // fallback back into the same starved window.
            if (fellBack) setTimeframe('ALL')
          })
          .catch(() => {
            if (!cancelled) setOraclePoints([])
          })
          .finally(() => !cancelled && setLoading(false))
      }
    } else {
      setFundingPoints([])
      api('get-perp-funding-events', {
        contractId: contract.id,
        limit: 5000,
      })
        .then((res) => {
          if (cancelled) return
          setFundingPoints(
            res
              .filter(
                (p) => Number.isFinite(p.ts) && Number.isFinite(p.fundingRate)
              )
              .map((p) => ({
                ts: p.ts,
                value: p.fundingRate,
                numLiquidations: p.numLiquidations,
              }))
          )
        })
        .catch(() => {
          if (!cancelled) setFundingPoints([])
        })
        .finally(() => !cancelled && setLoading(false))
    }
    return () => {
      cancelled = true
    }
    // activeFrame/cadence drive the price fetch window. Funding ignores both;
    // a redundant refetch when the cadence probe settles is harmless.
  }, [
    contract.id,
    contract.oracleFeedId,
    mode,
    activeFrame,
    cadenceMs,
    setTimeframe,
  ])

  const allPositions = useMemo(() => positions ?? [], [positions])
  // Open notional on each side whose liquidation price is within a small
  // move of the current price — the number behind the liquidation bands.
  // A big figure here is a fragile side: a move that far force-closes it.
  // (The price is an external oracle — liquidations here do not move it;
  // what they do is forfeit that side's margin to the backing pool.)
  const liqProximity = useMemo(() => {
    const price = Number(contract.oraclePrice)
    if (!(price > 0)) return null
    let longs = 0
    let shorts = 0
    for (const p of allPositions) {
      if (!Number.isFinite(p.liquidationPrice)) continue
      const d = (p.liquidationPrice - price) / price
      if (p.direction === 'long' && d < 0 && d >= -LIQ_PROXIMITY_BAND)
        longs += p.size
      if (p.direction === 'short' && d > 0 && d <= LIQ_PROXIMITY_BAND)
        shorts += p.size
    }
    return longs > 0 || shorts > 0 ? { longs, shorts } : null
  }, [allPositions, contract.oraclePrice])
  const userPositions = useMemo(
    () => (user ? allPositions.filter((p) => p.userId === user.id) : []),
    [allPositions, user?.id]
  )

  // Live tick append: the polled contract (useLivePerpContract upstream)
  // carries a fresh oraclePrice every ~15s, but the series is fetched once
  // on mount — without this the header price moves while the chart line
  // stays frozen at load time.
  useEffect(() => {
    setLivePoints([])
  }, [contract.id])
  // Funding markers can move or vanish when the geometry recomputes;
  // mouseleave won't fire on an unmounted node, so clear the tooltip here.
  useEffect(() => {
    setHoveredMark(null)
  }, [mode, contract.id, activeFrame])
  useEffect(() => {
    const ts = contract.oraclePriceTime
    const price = Number(contract.oraclePrice)
    if (!ts || !Number.isFinite(price) || price <= 0) return
    setLivePoints((prev) => {
      const last = prev[prev.length - 1]
      if (last && ts <= last.ts) return prev
      const next = [...prev, { ts, value: price }]
      // Bound growth over a long-lived tab; older ticks are already covered
      // by the fetched series on the next mount/refetch.
      return next.length > 2000 ? next.slice(-1000) : next
    })
  }, [contract.oraclePriceTime, contract.oraclePrice])

  // Price series = fetched history + live ticks that arrived after it.
  const priceSeries = useMemo(() => {
    if (!oraclePoints.length) return livePoints
    const lastFetched = oraclePoints[oraclePoints.length - 1].ts
    const fresh = livePoints.filter((p) => p.ts > lastFetched)
    return fresh.length ? [...oraclePoints, ...fresh] : oraclePoints
  }, [oraclePoints, livePoints])

  const windowedSeries = useMemo(() => {
    if (activeFrame === 'ALL') return priceSeries
    const cutoff = chartNow - TIMEFRAME_MS[activeFrame]
    return priceSeries.filter((p) => p.ts >= cutoff)
  }, [priceSeries, activeFrame, chartNow])

  // Funding is the venue-standard line of per-period rates (Hyperliquid
  // renders funding history the same way, in the same %/hr units — ours are
  // %/hr or %/day per the contract's period), anchored to "now" at the live
  // pool rate so the line doesn't stop at the last transfer. The ghost flag
  // marks that anchor for the hover copy — it's the current period accruing,
  // not a transfer that happened.
  const fundingSeries = useMemo(() => {
    if (mode !== 'funding') return fundingPoints
    return [
      ...fundingPoints,
      { ts: chartNow, value: liveFundingRate, ghost: true },
    ]
  }, [mode, fundingPoints, liveFundingRate, chartNow])

  const points = mode === 'price' ? windowedSeries : fundingSeries
  const width = Math.max(280, measuredWidth ?? 720)

  const overlayGeom = useMemo((): OverlayGeometry | null => {
    if (mode !== 'price' || windowedSeries.length < 2) return null
    const price = Number(contract.oraclePrice)
    if (!Number.isFinite(price) || price <= 0) return null
    const showYou = overlays.you && userPositions.length > 0
    // The toggle can be on from another market this session while THIS
    // market has nothing to draw (the chip is even hidden then) — an
    // ungated check here would manufacture an empty future zone.
    const showLiqs = overlays.liqs && allPositions.length > 0
    if (!overlays.carry && !overlays.cone && !showLiqs && !showYou) {
      return null
    }
    // Liquidation bands are horizontal levels — only these three actually
    // draw into the future. With none of them on, horizon stays 0 and the
    // chart does not extend past its data.
    const projectsFuture = overlays.carry || overlays.cone || showYou

    const xs = windowedSeries.map((p) => p.ts)
    const maxTs = Math.max(...xs)
    // Clamp against client/server clock skew so the projection anchor never
    // lands left of the last tick.
    const now = Math.max(chartNow, maxTs)
    // The projection prefers ending just past the next two funding events,
    // so the hold-cost line answers a concrete question ("what does holding
    // through the next transfers cost?") instead of extending an arbitrary
    // fraction of the window.
    const fundingTimes = nextFundingTimes(
      contract.lastFundingTime,
      now,
      8,
      fundingPeriodMs,
      contract.createdTime
    )
    const horizon = projectsFuture
      ? projectionHorizonWithFunding(maxTs - Math.min(...xs), now, fundingTimes)
      : 0

    const carry = overlays.carry
      ? carryNeutralPath(price, liveFundingRate, now, horizon, fundingPeriodMs)
      : []
    // Diamonds where the upcoming funding transfers land on the line —
    // only when the horizon spans few enough periods that each diamond
    // reads as an event; on long projections they'd bunch into dust.
    const fundingMarks =
      carry.length > 0 && horizon <= 8 * fundingPeriodMs
        ? fundingTimes
            .filter((t) => t <= now + horizon)
            .map((t) => ({
              ts: t,
              value:
                price * (1 + liveFundingRate * ((t - now) / fundingPeriodMs)),
            }))
        : []
    // The vol estimate uses the FULL fetched series, not the visible
    // window — a 1H frame shouldn't produce a jumpier cone than All —
    // with outage gaps excluded so a multi-day hole can't swamp the
    // elapsed-time denominator.
    const sigma = overlays.cone ? realizedVolPerSqrtMs(priceSeries) : null
    const cone = sigma != null ? volConePaths(price, sigma, now, horizon) : null

    const ys = windowedSeries.map((p) => p.value)
    const histRange = Math.max(...ys) - Math.min(...ys) || price * 0.02 || 1
    const liqBands = showLiqs
      ? clusterLiquidationBands(allPositions, histRange * 0.02)
      : []
    const yours = showYou
      ? userPositions.map((p) => ({
          direction: p.direction,
          entryPrice: p.entryPrice,
          liquidationPrice: p.liquidationPrice,
          breakEven: personalBreakEvenPath(
            p,
            liveFundingRate,
            contract.poolLong,
            contract.poolShort,
            now,
            horizon,
            24,
            fundingPeriodMs
          ),
        }))
      : []
    return { now, horizon, carry, fundingMarks, cone, liqBands, yours }
  }, [
    mode,
    windowedSeries,
    priceSeries,
    overlays,
    allPositions,
    userPositions,
    liveFundingRate,
    contract.oraclePrice,
    contract.poolLong,
    contract.poolShort,
    contract.lastFundingTime,
    fundingPeriodMs,
    chartNow,
  ])

  const { xScale, yScale, path } = useMemo(() => {
    if (!points.length) return { xScale: null, yScale: null, path: '' }
    const xs = points.map((p) => p.ts)
    const ys = points.map((p) => p.value)
    const xMax =
      overlayGeom && overlayGeom.horizon > 0
        ? overlayGeom.now + overlayGeom.horizon
        : Math.max(...xs)
    const x = scaleTime()
      .domain([Math.min(...xs), Math.max(xMax, Math.max(...xs))])
      .range([40, width - 10])
    let yMin = Math.min(...ys)
    let yMax = Math.max(...ys)
    // Flat series need a synthetic pad, but the fallback must match the
    // data's units: ±1 is fine for prices, while funding rates are raw
    // per-period fractions (~1e-5), where a ±1 pad renders the axis as
    // ±876,000% annualized. Pad relative to the series' own magnitude.
    const flatPad =
      mode === 'funding'
        ? Math.max(Math.abs(yMax), Math.abs(yMin)) * 0.5 || 1e-5
        : 1
    if (overlayGeom) {
      // Grow the domain to fit the projections, but never past 1.25× the
      // history's own range beyond its bounds — a steep carry line exits
      // through the top of the clip area instead of crushing the price
      // history (exiting the chart IS the "huge hurdle" signal).
      const range = yMax - yMin || flatPad
      const capLo = yMin - 1.25 * range
      const capHi = yMax + 1.25 * range
      const clamped: number[] = []
      for (const p of overlayGeom.carry) clamped.push(p.value)
      if (overlayGeom.cone) {
        const { upper, lower } = overlayGeom.cone
        clamped.push(upper[upper.length - 1].value)
        clamped.push(lower[lower.length - 1].value)
      }
      for (const yr of overlayGeom.yours) {
        clamped.push(yr.entryPrice)
        for (const p of yr.breakEven) clamped.push(p.value)
        // Liquidation levels only stretch the domain when already close —
        // a 1× position's liq at zero shouldn't flatten the whole chart.
        if (yr.liquidationPrice >= capLo && yr.liquidationPrice <= capHi) {
          yMin = Math.min(yMin, yr.liquidationPrice)
          yMax = Math.max(yMax, yr.liquidationPrice)
        }
      }
      for (const v of clamped) {
        if (!Number.isFinite(v)) continue
        const c = Math.min(Math.max(v, capLo), capHi)
        yMin = Math.min(yMin, c)
        yMax = Math.max(yMax, c)
      }
    }
    const pad = (yMax - yMin) * 0.1 || flatPad
    const y = scaleLinear()
      .domain([yMin - pad, yMax + pad])
      .range([height - 20, 10])
    // Break the line across data outages instead of drawing a fake straight
    // bridge over dead time (a stopped scheduler once left a 4.6-day gap
    // that rendered as one diagonal line swallowing the whole chart). Both
    // modes: the funding series interpolated a confident diagonal across
    // the same 5-day outage. The per-interval classifier also understands
    // cadence transitions such as daily backfill followed by hourly live
    // points, which a single global median misclassified as repeated gaps.
    const gapFlags = getDataGapFlags(points)
    const renderPoints: (Point & { gap?: boolean })[] = []
    for (let i = 0; i < points.length; i++) {
      if (gapFlags[i]) {
        renderPoints.push({
          ts: (points[i - 1].ts + points[i].ts) / 2,
          value: NaN,
          gap: true,
        })
      }
      renderPoints.push(points[i])
    }
    const l = line<Point & { gap?: boolean }>()
      .defined((p) => !p.gap)
      .x((p) => x(p.ts))
      .y((p) => y(p.value))
    return { xScale: x, yScale: y, path: l(renderPoints) ?? '' }
  }, [points, height, width, mode, overlayGeom])

  if (loading) {
    return (
      <div
        className="bg-canvas-50 flex items-center justify-center rounded-md"
        style={{ height }}
      >
        <span className="text-ink-500 text-sm">Loading chart…</span>
      </div>
    )
  }
  if (!points.length || !xScale || !yScale) {
    return (
      <div
        className="bg-canvas-50 flex items-center justify-center rounded-md"
        style={{ height }}
      >
        <span className="text-ink-500 text-sm">No data yet</span>
      </div>
    )
  }

  const yTicks = yScale.ticks(4)
  // Infer decimals from the whole series so every tick uses the same scale.
  // For price mode, integer-valued series (e.g. DAU) render as "39" not
  // "39.0000"; for funding we annualize as a percentage with 2 decimals.
  const priceDecimals =
    mode === 'price' ? inferPriceDecimals(points.map((p) => p.value)) : 0
  // Axis labels follow the tick STEP, not the price magnitude — gridlines
  // 1,000 apart labelled "66,000.00" are pure noise.
  const yTickDecimals =
    mode === 'price' && yTicks.length > 1
      ? stepDecimals(Math.abs(yTicks[1] - yTicks[0]))
      : priceDecimals
  const [domainStart, domainEnd] = xScale.domain()
  const domainSpanMs = domainEnd.getTime() - domainStart.getTime()
  const projectionEnd =
    overlayGeom && overlayGeom.horizon > 0
      ? new Date(overlayGeom.now + overlayGeom.horizon)
      : null
  const projectionEndX = projectionEnd ? xScale(projectionEnd) : null
  // Keep centered labels clear of the y-axis gutter and the right edge. When
  // the price chart extends into the future, reserve the far-right label for
  // the exact projection endpoint: D3's "nice" ticks do not guarantee that
  // an arbitrary domain endpoint is included.
  const projectionLabelReserve = width < 480 ? 100 : 84
  const xTicks = xScale.ticks(5).filter((t) => {
    const x = xScale(t)
    return (
      x >= 60 &&
      x <= width - 36 &&
      (projectionEndX == null || projectionEndX - x >= projectionLabelReserve)
    )
  })

  // Convert a mouse event's client x to the nearest data point index. We
  // map client x into viewBox coords using the SVG's bounding rect; the
  // viewBox width tracks the measured container, so the ratio is ~1 except
  // for the first frame before measurement.
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const vbX = ((e.clientX - rect.left) / rect.width) * width
    // The projection zone has no data to inspect — hovering there would
    // just pin the crosshair to the last real point, which reads as the
    // projection being "worth" that value. Hide it instead.
    if (
      overlayGeom &&
      overlayGeom.horizon > 0 &&
      vbX > xScale(overlayGeom.now) + 8
    ) {
      setHoverIdx(null)
      return
    }
    // Bisect by x-pixel of each point.
    let closest = 0
    let bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const px = xScale(points[i].ts)
      const d = Math.abs(px - vbX)
      if (d < bestDist) {
        bestDist = d
        closest = i
      }
    }
    setHoverIdx(closest)
  }

  const hovered = hoverIdx != null ? points[hoverIdx] : null
  const hoveredX = hovered ? xScale(hovered.ts) : 0
  const hoveredY = hovered ? yScale(hovered.value) : 0

  // Position the tooltip above the crosshair, but flip it to the right of
  // the cursor when close to the left edge so it doesn't clip.
  const tooltipLeftPct = hovered ? (hoveredX / width) * 100 : 0
  const nearLeftEdge = tooltipLeftPct < 20
  const nearRightEdge = tooltipLeftPct > 80

  const toggleOverlay = (key: OverlayKey) =>
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }))

  const toOverlayPath = (pts: ProjectionPoint[]) =>
    line<ProjectionPoint>()
      .x((p) => xScale(p.ts))
      .y((p) => yScale(p.value))(pts) ?? ''

  const coneAreaPath = (cone: NonNullable<OverlayGeometry['cone']>) => {
    const px = (p: ProjectionPoint) => `${xScale(p.ts)},${yScale(p.value)}`
    const upper = cone.upper.map(px)
    const lowerBack = [...cone.lower].reverse().map(px)
    return `M${upper.join('L')}L${lowerBack.join('L')}Z`
  }

  const nowX = overlayGeom ? xScale(overlayGeom.now) : 0
  const clipId = `perp-chart-clip-${contract.id}`

  // Funding events stranded between two gap-breaks (or at the series edge
  // next to one) draw no line segment at all — dev's single pre-outage
  // event was invisible. Mirror the scale memo's gap classification.
  const fundingGapFlags =
    mode === 'funding' ? getDataGapFlags(points) : undefined
  const isolatedFundingPoints =
    mode === 'funding'
      ? points.filter(
          (_p, i) =>
            (i === 0 || fundingGapFlags?.[i]) &&
            (i === points.length - 1 || fundingGapFlags?.[i + 1])
        )
      : []

  // Cumulative funding pinned to the carry line's endpoint — the answer to
  // "what does holding to here cost". Rendered only where the per-event
  // diamonds are suppressed: at short horizons the diamonds already say it
  // and the cumulative sum is dust. Tod 2026-07-27: mark the END with the
  // cumulative amount so the long dashed climb reads as accrued cost, not a
  // price forecast — as a single hover diamond, matching the per-event marks,
  // rather than baked-in text cluttering the plot.
  const carryEnd =
    overlayGeom &&
    overlayGeom.carry.length > 0 &&
    overlayGeom.fundingMarks.length === 0 &&
    liveFundingRate !== 0
      ? overlayGeom.carry[overlayGeom.carry.length - 1]
      : null
  const carryEndPct = carryEnd
    ? Math.abs(liveFundingRate) * (overlayGeom!.horizon / fundingPeriodMs) * 100
    : 0
  // Drawn outside the clip so the endpoint diamond stays whole at the right
  // edge, and clamped vertically because a steep carry line deliberately
  // exits the top of the plot.
  const carryEndX = carryEnd ? Math.min(xScale(carryEnd.ts), width - 12) : 0
  const carryEndY = carryEnd
    ? Math.min(Math.max(yScale(carryEnd.value), 14), height - 24)
    : 0

  return (
    <Col className="gap-1.5">
      {mode === 'price' && (
        <Row className="flex-wrap items-center gap-1.5">
          <OverlayChip
            active={overlays.carry}
            onClick={() => toggleOverlay('carry')}
            label="Hold cost"
            tooltip="Where the price would have to move for a position opened now to break even on funding alone — not a price forecast. Diamonds mark the upcoming funding transfers. Finish above the line and longs came out ahead; below it, shorts did."
            swatch={<CarrySwatch />}
          />
          <OverlayChip
            active={overlays.cone}
            onClick={() => toggleOverlay('cone')}
            label="Typical range"
            tooltip="How far this feed typically moves, from its recent volatility (±1σ). If the hold-cost line escapes this range, funding dominates the odds."
            swatch={<ConeSwatch />}
          />
          {allPositions.length > 0 && (
            <OverlayChip
              active={overlays.liqs}
              onClick={() => toggleOverlay('liqs')}
              label="Liquidations"
              tooltip="Price levels where open positions would be liquidated. Thicker bands = more money at risk there."
              swatch={<LiqSwatch />}
            />
          )}
          {userPositions.length > 0 && (
            <OverlayChip
              active={overlays.you}
              onClick={() => toggleOverlay('you')}
              label="You"
              tooltip="Your entry (solid), liquidation (dotted amber), and break-even (dashed)."
              swatch={<YouSwatch />}
            />
          )}
          <Row className="ml-auto gap-0.5">
            {TIMEFRAMES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTimeframe(f)}
                disabled={!frameEligible(f)}
                className={clsx(
                  'rounded px-1.5 py-0.5 text-xs tabular-nums transition-colors',
                  activeFrame === f
                    ? 'bg-ink-200 text-ink-900 font-semibold'
                    : 'text-ink-500 hover:text-ink-800',
                  !frameEligible(f) && 'cursor-not-allowed opacity-40'
                )}
              >
                {f === 'ALL' ? 'All' : f}
              </button>
            ))}
          </Row>
        </Row>
      )}
      <div
        className={clsx('relative', plotClassName)}
        style={{ height }}
        ref={containerRef}
      >
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={
            mode === 'price'
              ? `Oracle price history and projected holding costs for ${contract.question}`
              : `Funding rate history for ${contract.question}`
          }
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={40}
                x2={width - 10}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <text
                x={4}
                y={yScale(t) + 4}
                fontSize={10}
                fill="currentColor"
                opacity={0.6}
              >
                {formatTick(t, mode, yTickDecimals)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={t.getTime()}
              x={xScale(t)}
              y={height - 5}
              fontSize={10}
              textAnchor="middle"
              fill="currentColor"
              opacity={0.6}
            >
              {formatXTick(t, domainSpanMs)}
            </text>
          ))}
          {projectionEnd && projectionEndX != null && (
            <g>
              <line
                x1={projectionEndX}
                x2={projectionEndX}
                y1={height - 20}
                y2={height - 16}
                stroke="currentColor"
                strokeOpacity={0.45}
              />
              <text
                x={projectionEndX}
                y={height - 5}
                fontSize={10}
                fontWeight={600}
                textAnchor="end"
                fill="currentColor"
                opacity={0.8}
              >
                {formatProjectionEndTick(projectionEnd, domainSpanMs)}
              </text>
            </g>
          )}
          {overlayGeom && (
            <>
              <defs>
                <clipPath id={clipId}>
                  <rect x={40} y={10} width={width - 50} height={height - 30} />
                </clipPath>
              </defs>
              {/* Future zone: everything right of "now" is projection. Only
                  drawn when something actually projects — level-only
                  overlays (liq bands) span the data instead. */}
              {overlayGeom.horizon > 0 && (
                <g className="text-ink-500">
                  <rect
                    x={nowX}
                    y={10}
                    width={Math.max(0, width - 10 - nowX)}
                    height={height - 30}
                    fill="currentColor"
                    fillOpacity={0.03}
                  />
                  <line
                    x1={nowX}
                    x2={nowX}
                    y1={10}
                    y2={height - 20}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                  />
                </g>
              )}
              <g clipPath={`url(#${clipId})`}>
                {overlayGeom.cone && (
                  <g className="text-ink-500">
                    <path
                      d={coneAreaPath(overlayGeom.cone)}
                      fill="currentColor"
                      fillOpacity={0.06}
                    />
                    <path
                      d={toOverlayPath(overlayGeom.cone.upper)}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={0.25}
                      strokeWidth={1}
                    />
                    <path
                      d={toOverlayPath(overlayGeom.cone.lower)}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={0.25}
                      strokeWidth={1}
                    />
                  </g>
                )}
                {overlayGeom.liqBands.map((b, i) => (
                  <line
                    key={i}
                    // With a projection zone the bands live in that gutter,
                    // clear of the price path; without one they span the
                    // data like ordinary level lines.
                    x1={overlayGeom.horizon > 0 ? nowX : 40}
                    x2={width - 10}
                    y1={yScale(b.price)}
                    y2={yScale(b.price)}
                    stroke="currentColor"
                    strokeOpacity={0.3}
                    strokeWidth={2 + 5 * Math.sqrt(b.weight)}
                    className="text-amber-500"
                  />
                ))}
                {overlayGeom.carry.length > 0 && (
                  <path
                    d={toOverlayPath(overlayGeom.carry)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    strokeOpacity={0.7}
                    className="text-ink-600"
                  />
                )}
                {overlayGeom.fundingMarks.map((m) => {
                  const isHovered = hoveredMark?.ts === m.ts
                  const half = isHovered ? 4.5 : 3
                  return (
                    <g
                      key={m.ts}
                      className="cursor-help"
                      role="img"
                      tabIndex={0}
                      aria-label={`Funding mark, ${formatHoverDate(m.ts)}. ${
                        liveFundingRate > 0
                          ? 'Longs pay shorts'
                          : liveFundingRate < 0
                          ? 'Shorts pay longs'
                          : 'No funding transfer'
                      }, ${(Math.abs(liveFundingRate) * 100).toFixed(
                        3
                      )}% of margin.`}
                      onMouseEnter={() => setHoveredMark(m)}
                      onMouseLeave={() => setHoveredMark(null)}
                      onFocus={() => setHoveredMark(m)}
                      onBlur={() => setHoveredMark(null)}
                    >
                      {/* Oversized invisible hit area — a 6px diamond is
                          not a hover target. */}
                      <circle
                        cx={xScale(m.ts)}
                        cy={yScale(m.value)}
                        r={11}
                        fill="transparent"
                      />
                      {/* Halo ring signals "this responds to you". */}
                      {isHovered && (
                        <circle
                          cx={xScale(m.ts)}
                          cy={yScale(m.value)}
                          r={8}
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity={0.35}
                          className="text-primary-600"
                        />
                      )}
                      <rect
                        x={-half}
                        y={-half}
                        width={half * 2}
                        height={half * 2}
                        transform={`translate(${xScale(m.ts)} ${yScale(
                          m.value
                        )}) rotate(45)`}
                        fill="currentColor"
                        fillOpacity={isHovered ? 1 : 0.85}
                        className={
                          isHovered ? 'text-primary-600' : 'text-ink-600'
                        }
                      />
                    </g>
                  )
                })}
                {overlayGeom.yours.map((yr) => (
                  <g
                    key={yr.direction}
                    className={
                      yr.direction === 'long'
                        ? 'text-teal-500'
                        : 'text-scarlet-500'
                    }
                  >
                    <line
                      x1={nowX}
                      x2={width - 10}
                      y1={yScale(yr.entryPrice)}
                      y2={yScale(yr.entryPrice)}
                      stroke="currentColor"
                      strokeOpacity={0.8}
                      strokeWidth={1}
                    />
                    <line
                      x1={nowX}
                      x2={width - 10}
                      y1={yScale(yr.liquidationPrice)}
                      y2={yScale(yr.liquidationPrice)}
                      stroke="currentColor"
                      strokeOpacity={0.9}
                      strokeWidth={1.25}
                      strokeDasharray="2 3"
                      className="text-amber-500"
                    />
                    {yr.breakEven.length > 0 && (
                      <path
                        d={toOverlayPath(yr.breakEven)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.25}
                        strokeDasharray="6 4"
                        strokeOpacity={0.65}
                      />
                    )}
                  </g>
                ))}
              </g>
            </>
          )}
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-primary-500"
          />
          {mode === 'price' && points.length === 1 && (
            <circle
              cx={xScale(points[0].ts)}
              cy={yScale(points[0].value)}
              r={3}
              fill="currentColor"
              className="text-primary-500"
            />
          )}
          {/* A transfer with dead time on both sides has no line segment to
              live on — the gap-break isolates it — so render it as a dot
              rather than letting it vanish. */}
          {isolatedFundingPoints.map((p) => (
            <circle
              key={p.ts}
              cx={xScale(p.ts)}
              cy={yScale(p.value)}
              r={2}
              fill="currentColor"
              className="text-primary-500"
            />
          ))}
          {/* Transfers that liquidated positions get a marker on the line —
              numLiquidations rides along in the API response. */}
          {mode === 'funding' &&
            points
              .filter((p) => (p.numLiquidations ?? 0) > 0)
              .map((p) => (
                <circle
                  key={p.ts}
                  cx={xScale(p.ts)}
                  cy={yScale(p.value)}
                  r={2.5}
                  fill="currentColor"
                  className="text-amber-500"
                />
              ))}
          {carryEnd && (
            <g
              className="cursor-help"
              role="img"
              tabIndex={0}
              aria-label={`Hold cost to the end of this projection: ${
                liveFundingRate > 0 ? 'longs' : 'shorts'
              } pay about ${formatCarryEndPct(carryEndPct)}% of margin.`}
              onMouseEnter={() => setHoveredCarryEnd(true)}
              onMouseLeave={() => setHoveredCarryEnd(false)}
              onFocus={() => setHoveredCarryEnd(true)}
              onBlur={() => setHoveredCarryEnd(false)}
            >
              {/* Oversized invisible hit area — a 6px diamond is not a hover
                  target. */}
              <circle cx={carryEndX} cy={carryEndY} r={11} fill="transparent" />
              {hoveredCarryEnd && (
                <circle
                  cx={carryEndX}
                  cy={carryEndY}
                  r={8}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.35}
                  className="text-primary-600"
                />
              )}
              <rect
                x={hoveredCarryEnd ? -4.5 : -3}
                y={hoveredCarryEnd ? -4.5 : -3}
                width={hoveredCarryEnd ? 9 : 6}
                height={hoveredCarryEnd ? 9 : 6}
                transform={`translate(${carryEndX} ${carryEndY}) rotate(45)`}
                fill="currentColor"
                fillOpacity={hoveredCarryEnd ? 1 : 0.85}
                className={
                  hoveredCarryEnd ? 'text-primary-600' : 'text-ink-600'
                }
              />
            </g>
          )}
          {hovered && (
            <g className="text-primary-500 pointer-events-none">
              <line
                x1={hoveredX}
                x2={hoveredX}
                y1={10}
                y2={height - 20}
                stroke="currentColor"
                strokeOpacity={0.4}
                strokeDasharray="3 3"
              />
              <circle
                cx={hoveredX}
                cy={hoveredY}
                r={3.5}
                fill="currentColor"
                stroke="white"
                strokeWidth={1}
              />
            </g>
          )}
        </svg>
        {hovered && (
          <div
            className="bg-canvas-0 border-ink-200 pointer-events-none absolute top-2 whitespace-nowrap rounded-md border px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${tooltipLeftPct}%`,
              transform: nearLeftEdge
                ? 'translateX(8px)'
                : nearRightEdge
                ? 'translateX(calc(-100% - 8px))'
                : 'translateX(-50%)',
            }}
          >
            <div className="text-ink-500">
              {formatHoverDate(hovered.ts)}
              {hovered.ghost
                ? fundingPeriodMs === DAY_MS
                  ? ' · today, accruing'
                  : ' · this hour, accruing'
                : ''}
            </div>
            <div className="text-ink-900 font-semibold tabular-nums">
              {formatHoverValue(
                hovered.value,
                mode,
                priceDecimals,
                fundingPeriodUnit(fundingPeriodMs)
              )}
            </div>
            {mode === 'funding' && (
              <div className="text-ink-500">
                {hovered.value > 0
                  ? 'longs pay shorts'
                  : hovered.value < 0
                  ? 'shorts pay longs'
                  : 'balanced'}
                {hovered.value !== 0 &&
                  fundingPeriodMs < DAY_MS &&
                  ` · ≈${(
                    Math.abs(hovered.value) *
                    (DAY_MS / fundingPeriodMs) *
                    100
                  ).toFixed(2)}%/day`}
              </div>
            )}
            {mode === 'funding' && (hovered.numLiquidations ?? 0) > 0 && (
              <div className="text-amber-600">
                {hovered.numLiquidations} liquidation
                {(hovered.numLiquidations ?? 0) > 1 ? 's' : ''} this period
              </div>
            )}
          </div>
        )}
        {hoveredMark && (
          <div
            className="bg-canvas-0 border-ink-200 pointer-events-none absolute top-2 whitespace-nowrap rounded-md border px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${(xScale(hoveredMark.ts) / width) * 100}%`,
              transform:
                xScale(hoveredMark.ts) / width > 0.8
                  ? 'translateX(calc(-100% - 8px))'
                  : 'translateX(-50%)',
            }}
          >
            <div className="text-ink-900 font-semibold">Funding transfer</div>
            <div className="text-ink-500">
              {formatHoverDate(hoveredMark.ts)} ·{' '}
              {liveFundingRate > 0
                ? 'longs pay shorts'
                : liveFundingRate < 0
                ? 'shorts pay longs'
                : 'balanced'}{' '}
              {(Math.abs(liveFundingRate) * 100).toFixed(3)}% of margin
            </div>
          </div>
        )}
        {carryEnd && hoveredCarryEnd && (
          <div
            className="bg-canvas-0 border-ink-200 pointer-events-none absolute top-2 max-w-[15rem] rounded-md border px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${(carryEndX / width) * 100}%`,
              transform:
                carryEndX / width > 0.8
                  ? 'translateX(calc(-100% - 8px))'
                  : 'translateX(-50%)',
            }}
          >
            <div className="text-ink-900 whitespace-nowrap font-semibold">
              {liveFundingRate > 0 ? 'Longs' : 'Shorts'} pay ≈
              {formatCarryEndPct(carryEndPct)}% to here
            </div>
            <div className="text-ink-500">
              Based on the current funding rate (
              {(Math.abs(liveFundingRate) * 100).toFixed(3)}%/
              {fundingPeriodUnit(fundingPeriodMs)} of margin).
            </div>
          </div>
        )}
      </div>
      {mode === 'price' && overlays.liqs && liqProximity && (
        <Row className="text-ink-500 flex-wrap items-center gap-x-1 text-xs">
          <span>Within {LIQ_PROXIMITY_BAND * 100}% of liquidation:</span>
          {liqProximity.longs > 0 && (
            <>
              <TokenNumber
                amount={liqProximity.longs}
                numberType="short"
                className="font-semibold text-teal-700 dark:text-teal-400"
              />
              <span>of longs below</span>
            </>
          )}
          {liqProximity.longs > 0 && liqProximity.shorts > 0 && <span>·</span>}
          {liqProximity.shorts > 0 && (
            <>
              <TokenNumber
                amount={liqProximity.shorts}
                numberType="short"
                className="text-scarlet-700 dark:text-scarlet-400 font-semibold"
              />
              <span>of shorts above.</span>
            </>
          )}
          <span>
            A move that far force-closes them and forfeits their margin to the
            pool.
          </span>
        </Row>
      )}
      {mode === 'funding' && (
        <span className="text-ink-400 text-xs">
          {fundingPoints.length === 0
            ? `No funding events yet — the first can land after a full ${fundingPeriodNoun(
                fundingPeriodMs
              )} of trading${
                fundingPeriodMs > HOUR_MS ? ' and a new oracle update' : ''
              }.`
            : `${
                fundingPeriodMs === DAY_MS
                  ? 'Daily'
                  : fundingPeriodMs === HOUR_MS
                  ? 'Hourly'
                  : 'Per-period'
              } funding rate, % of margin per ${fundingPeriodNoun(
                fundingPeriodMs
              )}. Positive: longs pay shorts · negative: shorts pay longs.`}
        </span>
      )}
    </Col>
  )
}

const OverlayChip = (props: {
  active: boolean
  onClick: () => void
  label: string
  tooltip: string
  swatch: ReactNode
}) => {
  const { active, onClick, label, tooltip, swatch } = props
  return (
    // Below the chip, so the tooltip doesn't cover the price header above.
    <Tooltip text={tooltip} placement="bottom">
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors',
          active
            ? 'border-primary-300 bg-primary-100 text-ink-800'
            : 'border-ink-200 text-ink-400 hover:text-ink-600'
        )}
      >
        {swatch}
        <span className="whitespace-nowrap tabular-nums">{label}</span>
      </button>
    </Tooltip>
  )
}

const CarrySwatch = () => (
  <svg width={16} height={8} className="text-ink-600 shrink-0">
    <line
      x1={0}
      y1={4}
      x2={16}
      y2={4}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeDasharray="4 2.5"
    />
  </svg>
)

const ConeSwatch = () => (
  <svg width={16} height={8} className="text-ink-500 shrink-0">
    <path d="M0 4 L16 0.5 L16 7.5 Z" fill="currentColor" fillOpacity={0.3} />
  </svg>
)

const LiqSwatch = () => (
  <svg width={16} height={8} className="shrink-0 text-amber-500">
    <line
      x1={0}
      y1={4}
      x2={16}
      y2={4}
      stroke="currentColor"
      strokeWidth={3}
      strokeOpacity={0.5}
    />
  </svg>
)

const YouSwatch = () => (
  <svg width={16} height={8} className="shrink-0">
    <line
      x1={0}
      y1={2.5}
      x2={16}
      y2={2.5}
      className="text-teal-500"
      stroke="currentColor"
      strokeWidth={1.5}
    />
    <line
      x1={0}
      y1={5.5}
      x2={16}
      y2={5.5}
      className="text-amber-500"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeDasharray="2 2"
    />
  </svg>
)

// Decimals needed to distinguish axis ticks `step` apart: 0 for steps >= 1,
// else just enough to render the step's leading digit.
const stepDecimals = (step: number) => {
  if (!Number.isFinite(step) || step <= 0) return 0
  if (step >= 1) return 0
  return Math.min(6, Math.ceil(-Math.log10(step)))
}

const formatXTick = (d: Date, spanMs: number) => {
  const day = dayjs(d)
  if (spanMs <= 48 * 60 * 60 * 1000) return day.format('h:mm A')
  if (spanMs <= 300 * 24 * 60 * 60 * 1000) return day.format('MMM D')
  return day.format("MMM 'YY")
}

const formatProjectionEndTick = (d: Date, spanMs: number) => {
  const day = dayjs(d)
  if (spanMs <= 48 * HOUR_MS) return day.format('MMM D, h:mm A')
  if (spanMs <= 300 * DAY_MS) return day.format('MMM D')
  return day.format("MMM 'YY")
}

const formatTick = (
  v: number,
  mode: 'price' | 'funding',
  priceDecimals: number
) => {
  if (mode === 'funding') {
    // Per-period percent, trailing zeros trimmed — the chart is read in the
    // contract's own funding period (an annualized axis on an hourly chart
    // was the old chart's core sin). The unit lives in the hover + caption.
    const trimmed = (v * 100).toFixed(3).replace(/\.?0+$/, '')
    return `${trimmed === '' || trimmed === '-' ? '0' : trimmed}%`
  }
  return formatPrice(v, priceDecimals)
}

const formatHoverValue = (
  v: number,
  mode: 'price' | 'funding',
  priceDecimals: number,
  fundingUnit: string
) => {
  if (mode === 'funding') {
    const pct = v * 100
    return `${pct > 0 ? '+' : ''}${pct.toFixed(3)}%/${fundingUnit} of margin`
  }
  // For price mode, bump decimals slightly for the hover readout so tiny
  // movements are visible even on coarse-scale axes.
  const hoverDecimals = Math.max(priceDecimals, v === Math.round(v) ? 0 : 2)
  return formatPrice(v, hoverDecimals)
}

// Sub-1% carry needs the extra digit to say anything at all; past that the
// second decimal is noise on a rate that floats anyway.
const formatCarryEndPct = (pct: number) =>
  pct < 1 ? pct.toFixed(2) : pct.toFixed(1)

const formatHoverDate = (ts: number) => {
  const d = dayjs(ts)
  const now = dayjs()
  // If within the same day, show time of day; otherwise show the date.
  if (d.isSame(now, 'day')) return d.format('h:mm A')
  if (d.isSame(now, 'year')) return d.format('MMM D, h:mm A')
  return d.format('MMM D, YYYY')
}
