import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { PerpContract } from 'common/contract'
import { computeFundingRate } from 'common/perps/amm'
import {
  carryNeutralPath,
  clusterLiquidationBands,
  FUNDING_PERIOD_MS,
  gapThresholdMs,
  LiquidationBand,
  nextFundingTimes,
  personalBreakEvenPath,
  ProjectionPoint,
  projectionHorizonWithFunding,
  realizedVolPerSqrtMs,
  volConePaths,
} from 'common/perps/chart-projections'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { api } from 'web/lib/api/api'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { useUser } from 'web/hooks/use-user'

type Point = { ts: number; value: number }

// Funding events fire hourly in the engine (FUNDING_PERIOD_MS = HOUR_MS), so
// the per-period rate annualizes as rate * 24 * 365. Mirrors the constant in
// perp-overview.tsx.
const FUNDING_PERIODS_PER_YEAR = 24 * 365

type OpenPosition = {
  userId: string
  direction: 'long' | 'short'
  size: number
  costBasis: number
  originalCostBasis: number
  entryPrice: number
  leverage: number
  liquidationPrice: number
}

// Forward-projection overlays on the price chart. The price is an external
// oracle, so none of these are forecasts: carry is the funding break-even
// hurdle, the cone is the feed's own realized volatility, and the rest are
// position levels. Toggles persist across markets for the session.
// Calm by default: hold-cost line (with funding-event markers) and your own
// levels. The vol cone and crowd liquidation bands are analyst tools —
// opt-in, so a first-time visitor sees price, funding mechanics, and
// nothing else.
type OverlayKey = 'carry' | 'cone' | 'liqs' | 'you'
type OverlayToggles = { [k in OverlayKey]: boolean }
const DEFAULT_OVERLAYS: OverlayToggles = {
  carry: true,
  cone: false,
  liqs: false,
  you: true,
}

// Client-side windowing over the fetched series (v1): frames slice what is
// already loaded (5000 points). Upgrade to server-side since + bucketing
// when the API redeploys. 1W/1M matter for slow feeds: on a 30-min feed the
// All view spans months of dense texture, and the readable view — each
// day's wave distinct — lives at the weeks scale.
type Timeframe = '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL'
const TIMEFRAMES: Timeframe[] = ['1H', '6H', '1D', '1W', '1M', 'ALL']
const TIMEFRAME_MS: { [k in Timeframe]: number } = {
  '1H': HOUR_MS,
  '6H': 6 * HOUR_MS,
  '1D': DAY_MS,
  '1W': 7 * DAY_MS,
  '1M': 30 * DAY_MS,
  ALL: Infinity,
}

type OverlayGeometry = {
  now: number
  horizon: number
  carry: ProjectionPoint[]
  // Upcoming hourly funding transfers, positioned on the carry line.
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
}) => {
  const { contract, mode, height = 240, positions } = props
  const user = useUser()
  const [oraclePoints, setOraclePoints] = useState<Point[]>([])
  const [fundingPoints, setFundingPoints] = useState<Point[]>([])
  const [livePoints, setLivePoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [hoveredMark, setHoveredMark] = useState<ProjectionPoint | null>(null)
  const [overlays, setOverlays] = usePersistentInMemoryState<OverlayToggles>(
    DEFAULT_OVERLAYS,
    'perp-chart-overlays'
  )
  const [timeframe, setTimeframe] = usePersistentInMemoryState<Timeframe>(
    'ALL',
    'perp-chart-timeframe'
  )
  const svgRef = useRef<SVGSVGElement | null>(null)
  // Responsive: viewBox width tracks the container so axis text renders at
  // its nominal size on every screen instead of scaling down to ~6px at
  // phone widths.
  const { elemRef: containerRef, width: measuredWidth } = useMeasureSize()

  // Live rate from the current pools, not the hourly-refreshed
  // contract.fundingRate — same rationale as perp-overview.tsx.
  const liveFundingRate = computeFundingRate(
    contract.poolLong,
    contract.poolShort,
    contract.fundingSensitivity,
    contract.maxFundingRate
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setHoverIdx(null)
    // Backend returns the most recent `limit` points; 5000 is the schema
    // max. At 30-min cadence that's ~3.5 months of history (a 1000-point
    // fetch cut slow feeds off at ~3 weeks), and at 15s it stretches the
    // fast-feed window to ~20h, which feeds the 6H/1D frames properly.
    if (mode === 'price') {
      api('get-oracle-price-series', {
        feedId: contract.oracleFeedId,
        limit: 5000,
      })
        .then((res) => {
          if (cancelled) return
          setOraclePoints(res.map((p) => ({ ts: p.ts, value: p.price })))
        })
        .finally(() => !cancelled && setLoading(false))
    } else {
      api('get-perp-funding-events', {
        contractId: contract.id,
        limit: 1000,
      })
        .then((res) => {
          if (cancelled) return
          const series = res.map((p) => ({
            ts: p.ts,
            value: p.fundingRate,
          }))
          // Anchor the last point to "now" with the live rate (computed from
          // the current pools, matching the header) so the chart doesn't
          // drop off before the next funding tick.
          series.push({ ts: Date.now(), value: liveFundingRate })
          setFundingPoints(series)
        })
        .finally(() => !cancelled && setLoading(false))
    }
    return () => {
      cancelled = true
    }
  }, [contract.id, mode])

  const allPositions = useMemo(() => positions ?? [], [positions])
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
  }, [mode, contract.id, timeframe])
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
    if (!oraclePoints.length) return oraclePoints
    const lastFetched = oraclePoints[oraclePoints.length - 1].ts
    const fresh = livePoints.filter((p) => p.ts > lastFetched)
    return fresh.length ? [...oraclePoints, ...fresh] : oraclePoints
  }, [oraclePoints, livePoints])

  // A frame is offered only when it would show enough points to draw a
  // real line — a 30-min feed has 2-3 points in an hour, and a two-point
  // "chart" is junk. Selection falls back to All when starved.
  const MIN_FRAME_POINTS = 4
  const frameCounts = useMemo(() => {
    const now = Date.now()
    const counts = {} as { [k in Timeframe]: number }
    for (const f of TIMEFRAMES) {
      counts[f] =
        f === 'ALL'
          ? priceSeries.length
          : priceSeries.filter((p) => p.ts >= now - TIMEFRAME_MS[f]).length
    }
    return counts
  }, [priceSeries])
  const activeFrame =
    timeframe === 'ALL' || frameCounts[timeframe] >= MIN_FRAME_POINTS
      ? timeframe
      : 'ALL'

  const windowedSeries = useMemo(() => {
    if (activeFrame === 'ALL') return priceSeries
    const cutoff = Date.now() - TIMEFRAME_MS[activeFrame]
    return priceSeries.filter((p) => p.ts >= cutoff)
  }, [priceSeries, activeFrame])

  const points = mode === 'price' ? windowedSeries : fundingPoints
  const width = Math.max(320, measuredWidth ?? 720)

  const overlayGeom = useMemo((): OverlayGeometry | null => {
    if (mode !== 'price' || windowedSeries.length < 2) return null
    const price = Number(contract.oraclePrice)
    if (!Number.isFinite(price) || price <= 0) return null
    const showYou = overlays.you && userPositions.length > 0
    if (!overlays.carry && !overlays.cone && !overlays.liqs && !showYou) {
      return null
    }

    const xs = windowedSeries.map((p) => p.ts)
    const maxTs = Math.max(...xs)
    // Clamp against client/server clock skew so the projection anchor never
    // lands left of the last tick.
    const now = Math.max(Date.now(), maxTs)
    // The projection prefers ending just past the next two hourly funding
    // events, so the hold-cost line answers a concrete question ("what does
    // holding through the next transfers cost?") instead of extending an
    // arbitrary fraction of the window.
    const fundingTimes = nextFundingTimes(contract.lastFundingTime, now, 8)
    const horizon = projectionHorizonWithFunding(
      maxTs - Math.min(...xs),
      now,
      fundingTimes
    )

    const carry = overlays.carry
      ? carryNeutralPath(price, liveFundingRate, now, horizon)
      : []
    // Diamonds where the upcoming funding transfers land on the line —
    // only when the horizon spans few enough periods that each diamond
    // reads as an event; on long projections they'd bunch into dust.
    const fundingMarks =
      carry.length > 0 && horizon <= 8 * FUNDING_PERIOD_MS
        ? fundingTimes
            .filter((t) => t <= now + horizon)
            .map((t) => ({
              ts: t,
              value:
                price * (1 + liveFundingRate * ((t - now) / FUNDING_PERIOD_MS)),
            }))
        : []
    // The vol estimate uses the FULL fetched series, not the visible
    // window — a 1H frame shouldn't produce a jumpier cone than All —
    // with outage gaps excluded so a multi-day hole can't swamp the
    // elapsed-time denominator.
    const sigma = overlays.cone
      ? realizedVolPerSqrtMs(priceSeries, gapThresholdMs(priceSeries))
      : null
    const cone = sigma != null ? volConePaths(price, sigma, now, horizon) : null

    const ys = windowedSeries.map((p) => p.value)
    const histRange = Math.max(...ys) - Math.min(...ys) || price * 0.02 || 1
    const liqBands = overlays.liqs
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
            horizon
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
  ])

  const { xScale, yScale, path } = useMemo(() => {
    if (!points.length) return { xScale: null, yScale: null, path: '' }
    const xs = points.map((p) => p.ts)
    const ys = points.map((p) => p.value)
    const xMax = overlayGeom
      ? overlayGeom.now + overlayGeom.horizon
      : Math.max(...xs)
    const x = scaleTime()
      .domain([Math.min(...xs), Math.max(xMax, Math.max(...xs))])
      .range([40, width - 10])
    let yMin = Math.min(...ys)
    let yMax = Math.max(...ys)
    // Flat series need a synthetic pad, but the fallback must match the
    // data's units: ±1 is fine for prices, while funding rates are raw
    // per-hour fractions (~1e-5), where a ±1 pad renders the axis as
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
    // that rendered as one diagonal line swallowing the whole chart).
    const gapMs = mode === 'price' ? gapThresholdMs(points) : Infinity
    const renderPoints: (Point & { gap?: boolean })[] = []
    for (let i = 0; i < points.length; i++) {
      if (i > 0 && points[i].ts - points[i - 1].ts > gapMs) {
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
  // Keep centered labels clear of the y-axis gutter and the right edge.
  const xTicks = xScale
    .ticks(5)
    .filter((t) => xScale(t) >= 60 && xScale(t) <= width - 36)

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
    if (overlayGeom && vbX > xScale(overlayGeom.now) + 8) {
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

  return (
    <Col className="gap-1.5">
      {mode === 'price' && (
        <Row className="flex-wrap items-center gap-1.5">
          <OverlayChip
            active={overlays.carry}
            onClick={() => toggleOverlay('carry')}
            label="Hold cost"
            tooltip="Where the price would have to move for a position opened now to break even on funding alone — not a price forecast. Diamonds mark the upcoming hourly funding transfers. Finish above the line and longs came out ahead; below it, shorts did."
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
              tooltip="Your entry (solid), liquidation (dotted amber), and personal funding break-even (dashed). Funding is charged on margin, so higher leverage flattens your personal carry hurdle."
              swatch={<YouSwatch />}
            />
          )}
          <Row className="ml-auto gap-0.5">
            {TIMEFRAMES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTimeframe(f)}
                disabled={f !== 'ALL' && frameCounts[f] < MIN_FRAME_POINTS}
                className={clsx(
                  'rounded px-1.5 py-0.5 text-xs tabular-nums transition-colors',
                  activeFrame === f
                    ? 'bg-ink-200 text-ink-900 font-semibold'
                    : 'text-ink-500 hover:text-ink-800',
                  f !== 'ALL' &&
                    frameCounts[f] < MIN_FRAME_POINTS &&
                    'cursor-not-allowed opacity-40'
                )}
              >
                {f === 'ALL' ? 'All' : f}
              </button>
            ))}
          </Row>
        </Row>
      )}
      <div className="relative" style={{ height }} ref={containerRef}>
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
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
          {overlayGeom && (
            <>
              <defs>
                <clipPath id={clipId}>
                  <rect x={40} y={10} width={width - 50} height={height - 30} />
                </clipPath>
              </defs>
              {/* Future zone: everything right of "now" is projection. */}
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
                    x1={nowX}
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
                      onMouseEnter={() => setHoveredMark(m)}
                      onMouseLeave={() => setHoveredMark(null)}
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
            <div className="text-ink-500">{formatHoverDate(hovered.ts)}</div>
            <div className="text-ink-900 font-semibold tabular-nums">
              {formatHoverValue(hovered.value, mode, priceDecimals)}
            </div>
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
      </div>
      {/* fundingPoints carries a synthetic now-anchor, so length 1 = no real
          events. A near-empty funding chart reads as broken without context. */}
      {mode === 'funding' && fundingPoints.length <= 3 && (
        <span className="text-ink-400 text-xs">
          {fundingPoints.length <= 1
            ? 'No funding events yet — the first lands on the next hourly run.'
            : `Funding runs hourly — first event ${formatHoverDate(
                fundingPoints[0].ts
              )}. History fills in from here.`}
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

const formatTick = (
  v: number,
  mode: 'price' | 'funding',
  priceDecimals: number
) => {
  if (mode === 'funding') {
    const annualPct = v * FUNDING_PERIODS_PER_YEAR * 100
    return `${annualPct.toFixed(
      annualPct >= 100 || annualPct <= -100 ? 0 : 1
    )}%`
  }
  return formatPrice(v, priceDecimals)
}

const formatHoverValue = (
  v: number,
  mode: 'price' | 'funding',
  priceDecimals: number
) => {
  if (mode === 'funding') {
    const annualPct = v * FUNDING_PERIODS_PER_YEAR * 100
    const sign = annualPct > 0 ? '+' : ''
    return `${sign}${annualPct.toFixed(2)}% APR`
  }
  // For price mode, bump decimals slightly for the hover readout so tiny
  // movements are visible even on coarse-scale axes.
  const hoverDecimals = Math.max(priceDecimals, v === Math.round(v) ? 0 : 2)
  return formatPrice(v, hoverDecimals)
}

const formatHoverDate = (ts: number) => {
  const d = dayjs(ts)
  const now = dayjs()
  // If within the same day, show time of day; otherwise show the date.
  if (d.isSame(now, 'day')) return d.format('h:mm A')
  if (d.isSame(now, 'year')) return d.format('MMM D, h:mm A')
  return d.format('MMM D, YYYY')
}
