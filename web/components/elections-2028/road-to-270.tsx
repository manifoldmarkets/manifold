import clsx from 'clsx'
import { useMemo, useState } from 'react'

import { Contract } from 'common/contract'
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
import type { ElectoralModel } from 'web/lib/politics/elections-2028'
import { RATING, RATING_ORDER as ORDER } from './rating-colors'

const UNIT_BY_KEY = Object.fromEntries(ELECTORAL_UNITS.map((u) => [u.key, u]))

export function RoadTo270(props: {
  model: ElectoralModel
  partyContract: Contract | null
}) {
  const { model } = props

  const buckets = useMemo(() => {
    const evs = Object.fromEntries(ORDER.map((r) => [r, 0])) as Record<
      RatingBucket,
      number
    >
    for (const u of model.units)
      evs[ratingOf(u.pDem)] += UNIT_BY_KEY[u.key]?.ev ?? 0
    return evs
  }, [model.units])

  const demEvsExpected = Math.round(model.meanDemEv)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ModelHeadline model={model} partyContract={props.partyContract} />
        <EvHistogram model={model} />
      </div>

      <RatingBar buckets={buckets} />

      <TippingPoints model={model} />
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
