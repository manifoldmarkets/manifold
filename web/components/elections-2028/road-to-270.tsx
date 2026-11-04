import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { createContext, useContext, useMemo, useState } from 'react'

import { Contract } from 'common/contract'
import { USAMap } from 'web/components/usa-map/usa-map'
import { StateProps } from 'web/components/usa-map/presidential-state'
import { USAState } from 'web/components/usa-map/usa-state'
import { formatOdds } from 'web/components/usa-map/election-display'
import {
  DEM_COLOR,
  getPartyProbs,
  REP_COLOR,
} from 'web/components/usa-map/state-election-map'
import { useLiveContract } from 'web/hooks/use-contract'
import {
  ELECTORAL_UNITS,
  EV_TO_WIN,
  RatingBucket,
  ratingOf,
  TOTAL_EV,
} from 'web/lib/politics/ec-model'
import type { ElectoralModel, UnitOdds } from 'web/lib/politics/elections-2028'

// A diverging ramp, blue to red through a neutral gray: how sure each unit's
// market is, not just who leads.
const RATING: Record<
  RatingBucket,
  { fill: string; label: string; ink: 'light' | 'dark' }
> = {
  safeD: { fill: '#3b4f94', label: 'Safe D', ink: 'light' },
  likelyD: { fill: '#5671ba', label: 'Likely D', ink: 'light' },
  leanD: { fill: '#9fb3dc', label: 'Lean D', ink: 'dark' },
  tossup: { fill: '#cfcac4', label: 'Toss-up', ink: 'dark' },
  leanR: { fill: '#e3a5a2', label: 'Lean R', ink: 'dark' },
  likelyR: { fill: '#c25555', label: 'Likely R', ink: 'light' },
  safeR: { fill: '#8f2f32', label: 'Safe R', ink: 'light' },
}
const ORDER: RatingBucket[] = [
  'safeD',
  'likelyD',
  'leanD',
  'tossup',
  'leanR',
  'likelyR',
  'safeR',
]

const UNIT_BY_KEY = Object.fromEntries(ELECTORAL_UNITS.map((u) => [u.key, u]))

// The map's states read the model's odds from context: USAMap renders the
// component type it's given, which must be stable.
const UnitOddsContext = createContext<Record<string, UnitOdds>>({})

function ModelState(p: StateProps) {
  const u = useContext(UnitOddsContext)[p.stateKey]
  return (
    <USAState
      state={p.stateKey}
      stateData={p.data}
      fill={u ? RATING[ratingOf(u.pDem)].fill : undefined}
      onMouseEnterState={() => p.onMouseEnter(p.stateKey)}
      onMouseLeaveState={p.onMouseLeave}
      onClickState={() => p.handleClick(p.stateKey)}
      hovered={p.hoveredState === p.stateKey}
      selected={p.targetState === p.stateKey}
    />
  )
}

const marketHref = (u: UnitOdds) =>
  u.slug && u.creatorUsername ? `/${u.creatorUsername}/${u.slug}` : undefined

export function RoadTo270(props: {
  model: ElectoralModel
  partyContract: Contract | null
}) {
  const { model } = props
  const router = useRouter()
  const [hovered, setHovered] = useState<string | undefined>()
  const byKey = useMemo(
    () => Object.fromEntries(model.units.map((u) => [u.key, u])),
    [model.units]
  )

  const buckets = useMemo(() => {
    const evs = Object.fromEntries(ORDER.map((r) => [r, 0])) as Record<
      RatingBucket,
      number
    >
    for (const u of model.units)
      evs[ratingOf(u.pDem)] += UNIT_BY_KEY[u.key]?.ev ?? 0
    return evs
  }, [model.units])

  const focus = hovered ? byKey[hovered] : undefined
  const demEvsExpected = Math.round(model.meanDemEv)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ModelHeadline model={model} partyContract={props.partyContract} />
        <EvHistogram model={model} />
      </div>

      <RatingBar buckets={buckets} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="bg-canvas-0 border-ink-200 rounded-xl border p-2 sm:p-3">
          <UnitOddsContext.Provider value={byKey}>
            <USAMap
              mapContractsDictionary={{}}
              handleClick={(key) => {
                const u = key ? byKey[key] : undefined
                const href = u && marketHref(u)
                if (href) router.push(href)
              }}
              onMouseEnter={setHovered}
              onMouseLeave={() => setHovered(undefined)}
              targetState={undefined}
              hoveredState={hovered}
              CustomStateComponent={ModelState}
            />
          </UnitOddsContext.Provider>
          <div className="text-ink-700 flex min-h-[2.5rem] items-center justify-between gap-2 px-1 text-sm">
            {focus ? (
              <>
                <span>
                  <span className="text-ink-1000 font-semibold">
                    {UNIT_BY_KEY[focus.key]?.name}
                  </span>{' '}
                  · {UNIT_BY_KEY[focus.key]?.ev} electoral votes
                </span>
                <span className="tabular-nums">
                  D {formatOdds(focus.pDem)} · R {formatOdds(1 - focus.pDem)}
                </span>
              </>
            ) : (
              <span className="text-ink-500">
                Hover a state for its odds; click to trade it.
              </span>
            )}
          </div>
          <DistrictChips units={model.units} />
        </div>
        <TippingPoints model={model} />
      </div>
      <p className="text-ink-500 text-xs">
        {model.sims.toLocaleString('en-US')} simulated elections from
        Manifold&apos;s {model.units.filter((u) => u.contractId).length} state
        markets, with states moving together (correlation {model.rho.toFixed(2)}
        ). Expected electoral votes: Democrats {demEvsExpected}, Republicans{' '}
        {TOTAL_EV - demEvsExpected}.
      </p>
    </div>
  )
}

function ModelHeadline(props: {
  model: ElectoralModel
  partyContract: Contract | null
}) {
  const { model, partyContract } = props
  return (
    <div className="bg-canvas-0 border-ink-200 flex flex-col justify-between gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <span className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
          Electoral college model
        </span>
        <div className="flex items-end gap-5">
          <Figure value={model.pDem} label="Democrats" color={DEM_COLOR} />
          <Figure value={model.pRep} label="Republicans" color={REP_COLOR} />
          {model.pTie >= 0.005 && (
            <Figure value={model.pTie} label="269–269 tie" small />
          )}
        </div>
      </div>
      {partyContract && (
        <NationalComparison contract={partyContract} modelDem={model.pDem} />
      )}
    </div>
  )
}

// The national party market beside the model built from the states.
function NationalComparison(props: { contract: Contract; modelDem: number }) {
  const contract = useLiveContract(props.contract)
  const national = getPartyProbs(contract)
  if (!national) return null
  return (
    <p className="text-ink-600 text-sm">
      The national market gives Democrats{' '}
      <span className="text-ink-1000 font-semibold">
        {formatOdds(national.dem)}
      </span>
      . The state markets add up to{' '}
      <span className="text-ink-1000 font-semibold">
        {formatOdds(props.modelDem)}
      </span>
      {Math.abs(national.dem - props.modelDem) >= 0.05
        ? ': a gap traders can close from either side.'
        : '.'}
    </p>
  )
}

function Figure(props: {
  value: number
  label: string
  color?: string
  small?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span
        className={clsx(
          'text-ink-1000 font-semibold leading-none',
          props.small ? 'text-2xl' : 'text-4xl'
        )}
      >
        {formatOdds(props.value)}
      </span>
      <span className="text-ink-600 mt-1 flex items-center gap-1.5 text-xs">
        {props.color && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: props.color }}
          />
        )}
        {props.label}
      </span>
    </div>
  )
}

// The distribution of the Democrat's electoral votes, in 10-vote bins, with
// the 270 line. Bins at or past 270 are Democratic wins.
function EvHistogram(props: { model: ElectoralModel }) {
  const { histogram } = props.model
  const [hover, setHover] = useState<number | undefined>()
  const max = Math.max(...histogram.map(([, p]) => p), 0.001)
  const W = 538
  const H = 120
  const binW = (10 / TOTAL_EV) * W
  const x270 = (EV_TO_WIN / TOTAL_EV) * W
  const hoverBin = hover !== undefined ? histogram[hover] : undefined
  return (
    <div className="bg-canvas-0 border-ink-200 flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
          Democratic electoral votes
        </span>
        <span className="text-ink-700 text-xs tabular-nums">
          {hoverBin
            ? `${hoverBin[0]}–${Math.min(
                hoverBin[0] + 9,
                TOTAL_EV
              )}: ${formatOdds(hoverBin[1])}`
            : 'Each bar: 10 electoral votes'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Distribution of the Democratic nominee's electoral votes. Democrats reach 270 in ${formatOdds(
          props.model.pDem
        )} of simulations.`}
        onPointerLeave={() => setHover(undefined)}
      >
        {histogram.map(([start, p], i) => {
          const h = (p / max) * (H - 4)
          const demWin = start >= EV_TO_WIN
          return (
            <g key={start} onPointerEnter={() => setHover(i)}>
              <rect
                x={(start / TOTAL_EV) * W}
                y={0}
                width={binW}
                height={H}
                fill="transparent"
              />
              <rect
                x={(start / TOTAL_EV) * W + 1}
                y={H - h}
                width={Math.max(1, binW - 2)}
                height={h}
                rx={1.5}
                fill={demWin ? DEM_COLOR : REP_COLOR}
                opacity={hover === undefined || hover === i ? 1 : 0.45}
              />
            </g>
          )
        })}
        <line
          x1={x270}
          x2={x270}
          y1={0}
          y2={H}
          className="stroke-ink-900"
          strokeWidth={1.5}
        />
        <text
          x={x270 - 4}
          y={10}
          textAnchor="end"
          className="fill-ink-900 text-[11px] font-semibold"
        >
          270 to win
        </text>
        {[0, 100, 200, 300, 400, 500].map((t) => (
          <text
            key={t}
            x={(t / TOTAL_EV) * W}
            y={H + 14}
            textAnchor={t === 0 ? 'start' : 'middle'}
            className="fill-ink-500 text-[11px]"
          >
            {t}
          </text>
        ))}
      </svg>
    </div>
  )
}

// Electoral votes by rating, as one tall segmented bar, with the 270 mark.
function RatingBar(props: { buckets: Record<RatingBucket, number> }) {
  const { buckets } = props
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <div
          className="flex h-7 w-full gap-0.5"
          role="img"
          aria-label={ORDER.map(
            (r) => `${RATING[r].label} ${buckets[r]} electoral votes`
          ).join(', ')}
        >
          {ORDER.filter((r) => buckets[r] > 0).map((r, i, arr) => (
            <div
              key={r}
              className={clsx(
                'flex h-full items-center overflow-hidden px-1.5 text-xs font-semibold',
                i === 0 && 'rounded-l-md',
                i === arr.length - 1 && 'rounded-r-md',
                RATING[r].ink === 'light' ? 'text-white' : 'text-[#1e293b]'
              )}
              style={{
                width: `${(buckets[r] / TOTAL_EV) * 100}%`,
                backgroundColor: RATING[r].fill,
              }}
              title={`${RATING[r].label}: ${buckets[r]}`}
            >
              {buckets[r] >= 18 ? buckets[r] : ''}
            </div>
          ))}
        </div>
        <div
          className="bg-ink-1000 absolute -bottom-1 -top-1 w-0.5"
          style={{ left: `${(EV_TO_WIN / TOTAL_EV) * 100}%` }}
          aria-hidden
        />
      </div>
      <div className="text-ink-600 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {ORDER.map((r) => (
          <span key={r} className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: RATING[r].fill }}
            />
            {RATING[r].label} {buckets[r]}
          </span>
        ))}
      </div>
    </div>
  )
}

// Maine and Nebraska's congressional districts, which the map can't show.
function DistrictChips(props: { units: UnitOdds[] }) {
  const districts = props.units.filter((u) => u.key.includes('-'))
  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-1">
      {districts.map((u) => {
        const r = RATING[ratingOf(u.pDem)]
        const href = marketHref(u)
        const chip = (
          <span className="border-ink-200 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: r.fill }}
            />
            <span className="text-ink-900 font-medium">{u.key}</span>
            <span className="text-ink-600 tabular-nums">
              D {formatOdds(u.pDem)}
            </span>
          </span>
        )
        return href ? (
          <Link key={u.key} href={href} className="hover:opacity-80">
            {chip}
          </Link>
        ) : (
          <span key={u.key}>{chip}</span>
        )
      })}
    </div>
  )
}

function TippingPoints(props: { model: ElectoralModel }) {
  const tips = props.model.tippingPoints.slice(0, 6)
  const max = Math.max(...tips.map((t) => t.p), 0.001)
  return (
    <div className="bg-canvas-0 border-ink-200 flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
          Tipping-point states
        </span>
        <span className="text-ink-600 text-xs">
          The state that puts the winner over 270, by how often it does.
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {tips.map((t) => {
          const unit = UNIT_BY_KEY[t.key]
          return (
            <li key={t.key} className="flex items-center gap-2 text-sm">
              <span className="text-ink-900 w-28 shrink-0 truncate font-medium">
                {unit?.name ?? t.key}
              </span>
              <span className="bg-canvas-50 h-2 flex-1 overflow-hidden rounded-full">
                <span
                  className="bg-primary-500 block h-full rounded-full"
                  style={{ width: `${(t.p / max) * 100}%` }}
                />
              </span>
              <span className="text-ink-900 w-10 shrink-0 text-right font-semibold tabular-nums">
                {formatOdds(t.p)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
