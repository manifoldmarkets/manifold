import clsx from 'clsx'
import Link from 'next/link'
import { maxBy } from 'lodash'
import { ReactNode } from 'react'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { getAnswerProbability } from 'common/calculate'
import { Contract, contractPath, isMultiCpmm } from 'common/contract'
import { formatOdds, labelInk } from 'web/components/usa-map/election-display'
import {
  DEM_DARK_HEX,
  DEM_LIGHT_HEX,
  hexToRgb,
  REP_DARK_HEX,
  REP_LIGHT_HEX,
} from 'web/components/usa-map/state-election-map'
import { useLiveContract } from 'web/hooks/use-contract'
import { Bucket, orderedBuckets } from 'web/lib/politics/election-glance'
import { settledOrPrice } from 'web/lib/politics/race-board'
import { OddsRows, oddsItem } from './odds-rows'
import { useQuickBet } from './quick-bet'

// A market over ordered ranges (electoral votes, the popular-vote margin)
// as one strip: a cell per range in scale order, shaded by its chance in
// the colour of the side it falls on, with a line where one side becomes
// the other (270 electoral votes, an even vote). Reads at a glance where the
// mass of the bets sits and how much of it is past the line. Clicking a
// cell bets on that range.

// A count that is neither side's (a 50–50 Senate): grey.
const TIE_LIGHT_HEX = '#e4e4e7'
const TIE_DARK_HEX = '#71717a'

// From the party's light tone to its dark one, as the map shades a state.
const shade = (side: Bucket['side'], t: number) => {
  const [a, b] =
    side === 'D'
      ? [hexToRgb(DEM_LIGHT_HEX), hexToRgb(DEM_DARK_HEX)]
      : side === 'R'
      ? [hexToRgb(REP_LIGHT_HEX), hexToRgb(REP_DARK_HEX)]
      : [hexToRgb(TIE_LIGHT_HEX), hexToRgb(TIE_DARK_HEX)]
  const k = Math.max(0, Math.min(1, t))
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * k)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`
}

// Another reading of the same buckets, behind a toggle: the electoral-vote
// and seat markets count the Democrats', and `buckets` turns their ranges
// into the Republicans'.
export type StripFlip = {
  toggle: [string, string]
  // The toggle's accessible name ("Whose electoral votes").
  toggleLabel: string
  title: string
  thresholdLabel: string
  summary: (buckets: Bucket[]) => ReactNode
  buckets: (buckets: Bucket[]) => Bucket[] | undefined
  // A footnote under the flipped strip, and a line in the bet dialog
  // saying which of the market's answers a cell is.
  footnote: string
  note: (shown: Bucket, answer: Bucket) => string
}

export function OddsStrip(props: {
  contract: Contract
  title: string
  threshold: number
  // A count on neither side (50 Senate seats), drawn grey.
  tie?: number
  thresholdLabel: string
  summary: (buckets: Bucket[]) => ReactNode
  flip?: StripFlip
}) {
  const { threshold, tie, flip } = props
  const contract = useLiveContract(props.contract)
  const { open, dialog } = useQuickBet('election odds strip')
  const [flipped, setFlipped] = usePersistentInMemoryState(
    false,
    `election-odds-strip-flip-${props.contract.id}`
  )
  const buckets = isMultiCpmm(contract)
    ? orderedBuckets(
        contract.answers.map((a) => ({
          id: a.id,
          text: a.text,
          // A resolved market by its result (a seat count resolved
          // "Under 44" is 100% there), not its last prices.
          p: settledOrPrice(contract, a.id, (id) =>
            getAnswerProbability(contract, id)
          ),
        })),
        threshold,
        tie
      )
    : undefined
  // A market whose answers stop reading as ranges is still on the page, as
  // a line.
  if (!buckets)
    return (
      <div className="flex flex-col gap-1">
        <h3 className="text-ink-1000 text-sm font-semibold">{props.title}</h3>
        <OddsRows
          items={[oddsItem(contract)]}
          columns={1}
          trackingName="election odds strip fallback"
        />
      </div>
    )
  // The other reading, if the answers still read as counts; no toggle
  // otherwise.
  const otherReading = flip ? flip.buckets(buckets) : undefined
  const other = flipped ? otherReading : undefined
  const view = other && flip ? flip : props
  const shown = other ?? buckets
  const { title, thresholdLabel, summary } = view
  const top = maxBy(shown, (b) => b.p)?.p || 1
  // The line goes where the far side's ranges start (past a tie, if any).
  const far = shown[shown.length - 1].side
  const cross = shown.findIndex((b) => b.side === far)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-ink-1000 text-sm font-semibold">{title}</h3>
        {flip && otherReading && (
          <span
            role="group"
            aria-label={flip.toggleLabel}
            className="bg-canvas-50 ml-auto flex shrink-0 rounded-md p-0.5 text-xs"
          >
            {flip.toggle.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={flipped === (i === 1)}
                onClick={() => setFlipped(i === 1)}
                className={clsx(
                  'rounded px-2 py-0.5',
                  flipped === (i === 1)
                    ? 'bg-canvas-0 text-ink-1000 font-semibold shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                )}
              >
                {label}
              </button>
            ))}
          </span>
        )}
        <Link
          href={contractPath(contract)}
          className="text-ink-500 hover:text-primary-700 shrink-0 text-xs hover:underline"
        >
          Market →
        </Link>
      </div>
      <div className="text-ink-700 text-sm">{summary(shown)}</div>
      <div
        className="relative flex gap-0.5 pt-4"
        role="group"
        aria-label={title}
      >
        {shown.map((b, i) => {
          const fill = shade(b.side, b.p / top)
          return (
            <div
              key={b.id}
              className="relative flex min-w-0 flex-1 flex-col items-stretch gap-1"
            >
              {i === cross && cross > 0 && (
                <span
                  className="absolute -left-[3px] -top-4 bottom-5 flex w-1 flex-col items-center"
                  aria-hidden
                >
                  <span className="text-ink-800 -mt-0.5 whitespace-nowrap text-[10px] font-semibold leading-none">
                    {thresholdLabel}
                  </span>
                  <span className="bg-ink-900 mt-0.5 w-0.5 flex-1 rounded-full" />
                </span>
              )}
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`Bet on ${b.text}: ${formatOdds(b.p)}`}
                onClick={() => {
                  const answer = buckets.find((x) => x.id === b.id)
                  open({
                    contract,
                    answerId: b.id,
                    note:
                      other && flip && answer
                        ? flip.note(b, answer)
                        : undefined,
                  })
                }}
                className="flex h-9 items-center justify-center rounded-sm text-xs font-semibold tabular-nums transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                style={{ backgroundColor: fill, color: labelInk(fill) }}
              >
                {formatOdds(b.p)}
              </button>
              <span className="text-ink-600 truncate text-center text-[11px] tabular-nums">
                {b.label}
              </span>
            </div>
          )
        })}
      </div>
      {other && flip && <p className="text-ink-500 text-xs">{flip.footnote}</p>}
      {dialog}
    </div>
  )
}
