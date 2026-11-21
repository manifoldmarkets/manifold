import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import { maxBy } from 'lodash'
import { ReactNode, useState } from 'react'

import { contractPath, MultiContract } from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { FitText } from 'web/components/widgets/fit-text'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useIsClient } from 'web/hooks/use-is-client'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { Bucket, sideTotal } from 'web/lib/politics/election-glance'
import { useQuickBet } from './quick-bet'

// A market over ordered ranges (seats, electoral votes, the popular-vote
// margin) as a bar chart: one bar per range, its height the range's chance,
// shaded by the side it falls on, under a band naming each side and its
// total. Bars run from the Democratic side on the left (as the party bars
// above them) to the Republican side on the right, with a dashed line
// where one becomes the other. The chances 24 hours ago are outlined
// behind. A readout says the hovered bar, else the likeliest (or the final
// result); clicking a bar bets on it.

export type Party = 'D' | 'R'
export type ChartBar = Bucket & { dayAgo: number | undefined }

// The live page's tones.
const NEUTRAL_FILL = '#9e9fbd'
const TINT = {
  D: 'rgb(86 113 186 / 0.08)',
  R: 'rgb(194 85 85 / 0.08)',
  tie: 'rgb(158 159 189 / 0.12)',
}
export const SIDE_TEXT = {
  D: 'text-[#4f69b3] dark:text-[#93a7e2]',
  R: 'text-[#b84a4a] dark:text-[#ec9393]',
  tie: 'text-ink-700',
}
const FILL = { D: DEM_COLOR, R: REP_COLOR, tie: NEUTRAL_FILL }

export function BucketChart(props: {
  contract: MultiContract
  // In drawing order: the Democratic side first.
  bars: ChartBar[]
  title: ReactNode
  info?: string
  // After the readout's range ("seats", "electoral votes").
  unit: string
  // Each side's outcome, in full and short for a narrow band.
  outcome: (side: Bucket['side']) => string
  shortOutcome: (side: Bucket['side']) => string
  // The party symbol beside the readout.
  symbol: (bar: ChartBar) => Party | undefined
  // Under the chart: the rule that decides it.
  rule?: ReactNode
  // The bar's accessible name, before its chance.
  barName: (bar: ChartBar) => string
  // A line in the bet dialog where the bar reads differently from the
  // market's answer.
  note?: (bar: ChartBar) => string | undefined
  // The bet dialog's tracking name, and the click's own event.
  trackingName: string
  trackBet: (bar: ChartBar) => void
  // Without the card's frame, inside another card.
  bare?: boolean
}) {
  const { contract: live, bars, outcome, shortOutcome, barName, note } = props
  const [activeId, setActiveId] = useState<string>()
  const { open, dialog } = useQuickBet(props.trackingName)
  // Bars rise once the chart scrolls into view.
  const [revealed, setRevealed] = useState(false)
  const { ref } = useIsVisible(() => setRevealed(true), true)
  const isClient = useIsClient()

  const winner = live.isResolved ? bars.find((b) => b.p >= 1) : undefined
  const mostLikely = maxBy(bars, (b) => b.p)
  const shown = bars.find((b) => b.id === activeId) ?? winner ?? mostLikely
  if (!bars.length || !shown) return null
  // Whether the market still takes bets. The close time is read in the
  // browser only: a cached page can predate the close, and the first render
  // must match the server's. A click checks it again.
  const closed = () => live.closeTime != null && live.closeTime <= Date.now()
  const tradable = !live.isResolved && !(isClient && closed())

  const top = Math.max(0.01, ...bars.map((b) => Math.max(b.p, b.dayAgo ?? 0)))
  // The tallest bar stops short of the top, leaving room for its label.
  const height = (p: number) => (revealed ? `${(p / top) * 84}%` : '0%')
  // Bands in bar order: the near side, a tie, the far side (the line goes
  // where the far side starts).
  const sides = bars.reduce<Bucket['side'][]>(
    (out, b) => (out.includes(b.side) ? out : [...out, b.side]),
    []
  )
  const far = bars[bars.length - 1].side
  const lineAt = bars.findIndex((b) => b.side === far)
  const moved = (b: ChartBar) =>
    b.dayAgo !== undefined && Math.abs(b.p - b.dayAgo) >= 0.005
  const anyMoved = bars.some(moved)

  const bet = (b: ChartBar) => {
    if (!tradable || closed()) return
    props.trackBet(b)
    open({ contract: live, answerId: b.id, note: note?.(b) })
  }

  return (
    <div
      ref={ref}
      className={clsx(
        'flex flex-col',
        !props.bare && 'bg-canvas-0 border-ink-200 rounded-xl border p-3 sm:p-4'
      )}
    >
      <div className="flex items-baseline justify-between gap-1.5 text-sm font-semibold">
        <h3 className="text-ink-1000 flex items-center gap-1">
          {props.title}
          {props.info && (
            <InfoTooltip
              size="sm"
              text={props.info}
              tooltipParams={{ className: 'text-xs font-normal' }}
            />
          )}
        </h3>
        <Link
          href={contractPath(live)}
          className="text-ink-500 hover:text-primary-700 shrink-0 text-xs font-normal hover:underline"
        >
          Market →
        </Link>
      </div>

      <Readout
        bar={shown}
        unit={props.unit}
        symbol={props.symbol(shown)}
        outcome={outcome(shown.side)}
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
          {sides.map((side, i) => {
            const n = bars.filter((b) => b.side === side).length
            const total = formatOdds(sideTotal(bars, side))
            return (
              <div
                key={side}
                style={{ flex: n, backgroundColor: TINT[side] }}
                className={clsx(
                  'min-w-0 px-1.5 pb-1 pt-1.5',
                  SIDE_TEXT[side],
                  i === 0 && 'rounded-tl-md',
                  i === sides.length - 1 && 'rounded-tr-md',
                  side === far &&
                    i > 0 &&
                    'border-ink-400 border-l border-dashed'
                )}
                title={`${total} ${outcome(side)}`}
              >
                {/* The full name where it fits; a narrow band (a few bars,
                    a phone) gets the short one. */}
                <FitText
                  min={9}
                  short={
                    <>
                      <span className="font-semibold tabular-nums">
                        {total}
                      </span>{' '}
                      {shortOutcome(side)}
                    </>
                  }
                >
                  <span className="font-semibold tabular-nums">{total}</span>{' '}
                  {outcome(side)}
                </FitText>
              </div>
            )
          })}
        </div>

        <div className="flex h-32 sm:h-40">
          {bars.map((b, i) => {
            const active = b.id === shown.id
            const lead = b === mostLikely || b === winner
            return (
              <button
                key={b.id}
                type="button"
                className={clsx(
                  'focus-visible:ring-primary-500 relative flex h-full min-w-0 flex-1 items-end px-[2px] outline-none focus-visible:ring-2 sm:px-1',
                  tradable ? 'cursor-pointer' : 'cursor-default',
                  i === lineAt &&
                    i > 0 &&
                    'border-ink-400 border-l border-dashed'
                )}
                style={{ backgroundColor: TINT[b.side] }}
                aria-label={[
                  `${barName(b)}, ${formatOdds(b.p)}`,
                  outcome(b.side),
                  moved(b) && `${formatOdds(b.dayAgo ?? 0)} 24 hours ago`,
                  tradable && 'bet on it',
                ]
                  .filter(Boolean)
                  .join(', ')}
                aria-haspopup={tradable ? 'dialog' : undefined}
                aria-disabled={!tradable}
                onMouseEnter={() => setActiveId(b.id)}
                onFocus={() => setActiveId(b.id)}
                onBlur={() => setActiveId(undefined)}
                onClick={() => bet(b)}
              >
                <span
                  className="relative block w-full transition-[height] duration-700 ease-out motion-reduce:transition-none"
                  style={{ height: height(b.p) }}
                >
                  <span
                    className="absolute inset-0 rounded-t-[3px] transition-opacity"
                    style={{
                      backgroundColor: FILL[b.side],
                      opacity: active || lead ? 1 : 0.7,
                    }}
                  />
                </span>
                {moved(b) && (
                  <span
                    aria-hidden
                    className="border-ink-500 pointer-events-none absolute bottom-0 left-[2px] right-[2px] rounded-t-[3px] border border-b-0 border-dashed transition-[height] duration-700 ease-out motion-reduce:transition-none sm:left-1 sm:right-1"
                    style={{ height: height(b.dayAgo ?? 0) }}
                  />
                )}
                {/* Above the bar or its 24h outline, whichever is taller. */}
                <span
                  className={clsx(
                    'absolute left-1/2 -translate-x-1/2 whitespace-nowrap pb-0.5 text-[10px] tabular-nums transition-[bottom] duration-700 ease-out motion-reduce:transition-none sm:text-[11px]',
                    active || lead
                      ? 'text-ink-900 font-semibold'
                      : 'text-ink-600',
                    b.p < 0.05 && !active && 'hidden sm:block'
                  )}
                  style={{
                    bottom: height(
                      moved(b) ? Math.max(b.p, b.dayAgo ?? 0) : b.p
                    ),
                  }}
                >
                  {formatOdds(b.p)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="border-ink-300 flex border-t">
          {bars.map((b) => (
            <FitText
              key={b.id}
              min={8}
              className={clsx(
                'flex-1 px-px pt-1 text-center text-[11px] tabular-nums sm:text-xs',
                b.id === shown.id
                  ? 'text-ink-900 font-semibold'
                  : 'text-ink-600'
              )}
            >
              <span aria-hidden>{b.label}</span>
            </FitText>
          ))}
        </div>
      </div>

      <div className="text-ink-600 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
        {anyMoved && (
          <span className="flex items-center gap-1">
            <span className="border-ink-500 inline-block h-2.5 w-2.5 rounded-sm border border-dashed" />
            24 hours ago
          </span>
        )}
        {props.rule && <span>{props.rule}</span>}
        {tradable && <span className="sm:ml-auto">Pick a bar to bet</span>}
      </div>
      {dialog}
    </div>
  )
}

// The range being read: the hovered bar, else the final or likeliest one.
function Readout(props: {
  bar: ChartBar
  unit: string
  symbol: Party | undefined
  outcome: string
  caption?: string
  showChange: boolean
}) {
  const { bar, unit, symbol, outcome, caption, showChange } = props
  const change =
    showChange && bar.dayAgo !== undefined ? (bar.p - bar.dayAgo) * 100 : 0
  return (
    <div className="mt-2 flex items-center gap-2">
      {symbol && (
        <Image
          src={
            symbol === 'D'
              ? '/politics-party/democrat_symbol.png'
              : '/politics-party/republican_symbol.png'
          }
          alt=""
          width={28}
          height={28}
          className="h-6 w-6 shrink-0 object-contain sm:h-7 sm:w-7"
        />
      )}
      <div className="flex min-w-0 flex-col">
        <div className="flex items-baseline gap-1.5">
          <strong
            className={clsx(
              'whitespace-nowrap text-2xl font-bold tabular-nums leading-none sm:text-3xl',
              SIDE_TEXT[bar.side]
            )}
          >
            {bar.label}
          </strong>
          {unit && <span className="text-ink-600 text-sm">{unit}</span>}
        </div>
        <span className="text-ink-600 truncate text-xs">
          {[caption, outcome].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end">
        <span className="text-ink-900 text-lg font-semibold tabular-nums leading-tight sm:text-xl">
          {formatOdds(bar.p)}
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
