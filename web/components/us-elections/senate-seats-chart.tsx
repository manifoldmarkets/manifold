import { useMemo, useState } from 'react'
import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'

import {
  Contract,
  contractPath,
  CPMMMultiContract,
  isMultiCpmm,
} from 'common/contract'
import { TradeDialog } from 'web/components/bet/trade-ticket'
import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useLiveContract } from 'web/hooks/use-contract'
import { useIsVisible } from 'web/hooks/use-is-visible'
import {
  dayAgoProbs,
  DEM_SENATE_MAJORITY,
  SeatBucket,
  seatDistribution,
  seatOutcome,
} from 'web/lib/politics/senate-seats'
import { track } from 'web/lib/service/analytics'

const RULES =
  'Counts senators who caucus with the Democrats, independents included, in the new Senate. Democrats need 51 seats: at 50–50, Vice President Vance breaks ties. Other is any count not listed. Resolves January 4, 2027.'

// Display only: the map's fills, and its readable text tones per theme.
const NEUTRAL_FILL = '#9e9fbd'
const DEM_TINT = 'rgb(86 113 186 / 0.08)'
const REP_TINT = 'rgb(194 85 85 / 0.08)'
const DEM_TEXT = 'text-[#4f69b3] dark:text-[#93a7e2]'
const REP_TEXT = 'text-[#b84a4a] dark:text-[#ec9393]'

type Side = 'short' | 'majority' | 'rest'
const sideOf = (b: SeatBucket): Side =>
  b.seats === undefined
    ? 'rest'
    : b.seats >= DEM_SENATE_MAJORITY
    ? 'majority'
    : 'short'

// The Democrats' Senate seat count as a live histogram: one bar per count,
// shaded by who would run the Senate, with yesterday's chances outlined
// behind. Hover or focus a bar to read it; click it to bet on that count.
export function SenateSeatsChart(props: { contract: Contract }) {
  const { contract } = props
  if (!isMultiCpmm(contract) || contract.outcomeType !== 'MULTIPLE_CHOICE')
    return null
  return <SeatsChart contract={contract} />
}

function SeatsChart(props: { contract: CPMMMultiContract }) {
  const live = useLiveContract(props.contract)
  // 24h-ago chances come from the page snapshot, not the live market.
  const dayAgo = useMemo(() => dayAgoProbs(props.contract), [props.contract])
  const { buckets, mostLikely, short, majority } = useMemo(
    () => seatDistribution(live, dayAgo),
    [live, dayAgo]
  )
  const [activeId, setActiveId] = useState<string>()
  const [betting, setBetting] = useState<SeatBucket>()
  // Bars rise once the card scrolls into view.
  const [revealed, setRevealed] = useState(false)
  const { ref } = useIsVisible(() => setRevealed(true), true)

  const winner = live.isResolved
    ? buckets.find((b) => b.answerId === live.resolution)
    : undefined
  const tradable =
    !live.isResolved && (live.closeTime == null || live.closeTime > Date.now())
  const shown =
    buckets.find((b) => b.answerId === activeId) ?? winner ?? mostLikely
  if (!buckets.length || !shown) return null

  const top = Math.max(
    0.01,
    ...buckets.map((b) => Math.max(b.prob, b.dayAgoProb ?? 0))
  )
  // The tallest bar stops short of the top, leaving room for its label.
  const height = (p: number) => (revealed ? `${(p / top) * 84}%` : '0%')
  const count = (side: Side) => buckets.filter((b) => sideOf(b) === side).length
  const firstRest = buckets.findIndex((b) => sideOf(b) === 'rest')
  const firstMajority = buckets.findIndex((b) => sideOf(b) === 'majority')
  const columnClass = (i: number) =>
    clsx(
      i === firstMajority && i > 0 && 'border-ink-400 border-l border-dashed',
      i === firstRest && i > 0 && 'ml-1.5'
    )

  const bet = (b: SeatBucket) => {
    if (!tradable) return
    track('click senate seats bar', { seats: b.label })
    setBetting(b)
  }
  const betAnswer = betting
    ? live.answers.find((a) => a.id === betting.answerId)
    : undefined

  return (
    <div
      ref={ref}
      className="bg-canvas-50 mt-1 w-full max-w-[556px] rounded-[10px] p-2.5 sm:p-3.5"
    >
      <div className="flex items-baseline justify-between gap-1.5 text-xs font-medium sm:text-sm">
        <span className="flex items-center gap-1">
          Democratic Senate seats
          <InfoTooltip
            size="sm"
            text={RULES}
            tooltipParams={{ className: 'text-xs' }}
          />
        </span>
        <Link
          href={contractPath(live)}
          className="text-ink-600 hover:text-primary-700 whitespace-nowrap text-xs font-normal hover:underline"
        >
          chart →
        </Link>
      </div>

      <Readout
        bucket={shown}
        caption={
          shown === winner
            ? 'Final count'
            : shown === mostLikely
            ? 'Most likely'
            : undefined
        }
        showChange={!live.isResolved}
      />

      <div className="mt-3" onMouseLeave={() => setActiveId(undefined)}>
        <div className="flex text-[11px] leading-tight sm:text-xs">
          {short && (
            <RegionLabel
              flex={count('short')}
              tint={REP_TINT}
              tone={REP_TEXT}
              prob={short.prob}
              label="Republican Senate"
              shortLabel="Rep. Senate"
              title={`Chance the Democrats hold ${short.min} to ${short.max} seats`}
              className={clsx('rounded-tl-md', !majority && 'rounded-tr-md')}
            />
          )}
          {majority && (
            <RegionLabel
              flex={count('majority')}
              tint={DEM_TINT}
              tone={DEM_TEXT}
              prob={majority.prob}
              label="Democratic majority"
              shortLabel="Dem. majority"
              title={`Chance the Democrats hold ${majority.min} to ${majority.max} seats`}
              className={clsx(
                'rounded-tr-md',
                short
                  ? 'border-ink-400 border-l border-dashed'
                  : 'rounded-tl-md'
              )}
            />
          )}
          {count('rest') > 0 && (
            <div
              style={{ flex: count('rest') }}
              className={clsx(firstRest > 0 && 'ml-1.5')}
            />
          )}
        </div>

        <div className="flex h-32 sm:h-40">
          {buckets.map((b, i) => {
            const side = sideOf(b)
            const active = b.answerId === shown.answerId
            const lead = b === mostLikely || b === winner
            const moved =
              !live.isResolved &&
              b.dayAgoProb !== undefined &&
              Math.abs(b.prob - b.dayAgoProb) >= 0.005
            const name =
              b.seats === undefined ? b.label : `${b.label} Democratic seats`
            return (
              <button
                key={b.answerId}
                type="button"
                className={clsx(
                  'focus-visible:ring-primary-500 relative flex h-full min-w-0 flex-1 items-end px-[2px] outline-none focus-visible:ring-2 sm:px-1',
                  tradable ? 'cursor-pointer' : 'cursor-default',
                  columnClass(i)
                )}
                style={{
                  backgroundColor:
                    side === 'short'
                      ? REP_TINT
                      : side === 'majority'
                      ? DEM_TINT
                      : undefined,
                }}
                aria-label={`${name}, ${formatOdds(b.prob)}${
                  tradable ? ', bet on it' : ''
                }`}
                aria-haspopup={tradable ? 'dialog' : undefined}
                aria-disabled={!tradable}
                onMouseEnter={() => setActiveId(b.answerId)}
                onFocus={() => setActiveId(b.answerId)}
                onBlur={() => setActiveId(undefined)}
                onClick={() => bet(b)}
              >
                <span
                  className="relative block w-full transition-[height] duration-700 ease-out motion-reduce:transition-none"
                  style={{ height: height(b.prob) }}
                >
                  <span
                    className="absolute inset-0 rounded-t-[3px] transition-opacity"
                    style={{
                      backgroundColor:
                        side === 'short'
                          ? REP_COLOR
                          : side === 'majority'
                          ? DEM_COLOR
                          : NEUTRAL_FILL,
                      opacity: active || lead ? 1 : 0.7,
                    }}
                  />
                </span>
                {moved && (
                  <span
                    aria-hidden
                    className="border-ink-500 pointer-events-none absolute bottom-0 left-[2px] right-[2px] rounded-t-[3px] border border-b-0 border-dashed transition-[height] duration-700 ease-out motion-reduce:transition-none sm:left-1 sm:right-1"
                    style={{ height: height(b.dayAgoProb ?? 0) }}
                  />
                )}
                {/* Above the bar or its 24h outline, whichever is taller. */}
                <span
                  className={clsx(
                    'absolute left-1/2 -translate-x-1/2 whitespace-nowrap pb-0.5 text-[10px] tabular-nums transition-[bottom] duration-700 ease-out motion-reduce:transition-none sm:text-[11px]',
                    active || lead
                      ? 'text-ink-900 font-semibold'
                      : 'text-ink-600',
                    b.prob < 0.05 && !active && 'hidden sm:block'
                  )}
                  style={{
                    bottom: height(
                      moved ? Math.max(b.prob, b.dayAgoProb ?? 0) : b.prob
                    ),
                  }}
                >
                  {formatOdds(b.prob)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="border-ink-300 flex border-t">
          {buckets.map((b, i) => (
            <span
              key={b.answerId}
              aria-hidden
              className={clsx(
                'min-w-0 flex-1 whitespace-nowrap pt-1 text-center text-[10px] tabular-nums sm:text-xs',
                b.answerId === shown.answerId
                  ? 'text-ink-900 font-semibold'
                  : 'text-ink-600',
                i === firstRest && i > 0 && 'ml-1.5'
              )}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="text-ink-600 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
        {!live.isResolved && (
          <span className="flex items-center gap-1">
            <span className="border-ink-500 inline-block h-2.5 w-2.5 rounded-sm border border-dashed" />
            24 hours ago
          </span>
        )}
        <span>Dems need 51; Vance breaks a 50–50 tie</span>
        {tradable && <span className="sm:ml-auto">Pick a bar to bet</span>}
      </div>

      {betting && betAnswer && (
        <TradeDialog
          contract={live}
          multiProps={{ answers: live.answers, answerToBuy: betAnswer }}
          open
          setOpen={(open) => !open && setBetting(undefined)}
          title={
            betting.seats === undefined
              ? betting.label
              : `${betting.label} Democratic seats`
          }
          question={live.question}
          initialOutcome="YES"
          trackingLocation="election senate seats"
        />
      )}
    </div>
  )
}

// The count being read: the hovered bar, else the final or most likely count.
function Readout(props: {
  bucket: SeatBucket
  caption?: string
  showChange: boolean
}) {
  const { bucket, caption, showChange } = props
  const { seats, prob, dayAgoProb } = bucket
  const tone =
    seats === undefined
      ? 'text-ink-700'
      : seats >= DEM_SENATE_MAJORITY
      ? DEM_TEXT
      : REP_TEXT
  const change =
    showChange && dayAgoProb !== undefined ? (prob - dayAgoProb) * 100 : 0
  return (
    <div className="mt-2 flex items-center gap-2">
      <Image
        src="/politics-party/democrat_symbol.png"
        alt=""
        width={28}
        height={28}
        className="h-6 w-6 object-contain sm:h-7 sm:w-7"
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-baseline gap-1.5">
          <strong
            className={clsx(
              'text-2xl font-bold tabular-nums leading-none sm:text-3xl',
              tone
            )}
          >
            {bucket.label}
          </strong>
          {seats !== undefined && (
            <span className="text-ink-600 text-sm">seats</span>
          )}
        </div>
        <span className="text-ink-600 truncate text-xs">
          {[
            caption,
            seats === undefined ? 'Any count not listed' : seatOutcome(seats),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end">
        <span className="text-ink-900 text-lg font-semibold tabular-nums leading-tight sm:text-xl">
          {formatOdds(prob)}
        </span>
        {Math.abs(change) >= 0.5 ? (
          <span
            className={clsx(
              'text-xs tabular-nums',
              change > 0 ? 'text-teal-600' : 'text-scarlet-600'
            )}
          >
            {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)} pts in 24h
          </span>
        ) : (
          <span className="text-ink-600 text-xs">chance</span>
        )}
      </div>
    </div>
  )
}

function RegionLabel(props: {
  flex: number
  tint: string
  tone: string
  prob: number
  label: string
  shortLabel: string
  title: string
  className?: string
}) {
  const { flex, tint, tone, prob, label, shortLabel, title, className } = props
  return (
    <div
      style={{ flex, backgroundColor: tint }}
      className={clsx('min-w-0 truncate px-1.5 pb-1 pt-1.5', tone, className)}
      title={title}
    >
      <span className="font-semibold tabular-nums">{formatOdds(prob)}</span>{' '}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
    </div>
  )
}
