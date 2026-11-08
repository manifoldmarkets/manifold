import Link from 'next/link'
import { maxBy } from 'lodash'
import { ReactNode } from 'react'

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
import { OddsRows, oddsItem } from './odds-rows'

// A market over ordered ranges (electoral votes, the popular-vote margin)
// as one strip: a cell per range in scale order, shaded by its chance in
// the colour of the side it falls on, with a line where one side becomes
// the other (270 electoral votes, an even vote). Reads at a glance where the
// mass of the bets sits and how much of it is past the line.

// From the party's light tone to its dark one, as the map shades a state.
const shade = (side: 'D' | 'R', t: number) => {
  const [a, b] =
    side === 'D'
      ? [hexToRgb(DEM_LIGHT_HEX), hexToRgb(DEM_DARK_HEX)]
      : [hexToRgb(REP_LIGHT_HEX), hexToRgb(REP_DARK_HEX)]
  const k = Math.max(0, Math.min(1, t))
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * k)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`
}

export function OddsStrip(props: {
  contract: Contract
  title: string
  threshold: number
  thresholdLabel: string
  summary: (buckets: Bucket[]) => ReactNode
}) {
  const { title, threshold, thresholdLabel, summary } = props
  const contract = useLiveContract(props.contract)
  const buckets = isMultiCpmm(contract)
    ? orderedBuckets(
        contract.answers.map((a) => ({
          id: a.id,
          text: a.text,
          p: getAnswerProbability(contract, a.id),
        })),
        threshold
      )
    : undefined
  // A market whose answers stop reading as ranges is still on the page, as
  // a line.
  if (!buckets)
    return (
      <div className="flex flex-col gap-1">
        <h3 className="text-ink-1000 text-sm font-semibold">{title}</h3>
        <OddsRows
          items={[oddsItem(contract)]}
          columns={1}
          trackingName="election odds strip fallback"
        />
      </div>
    )
  const top = maxBy(buckets, (b) => b.p)?.p || 1
  const cross = buckets.findIndex((b) => b.side === 'D')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-ink-1000 text-sm font-semibold">{title}</h3>
        <Link
          href={contractPath(contract)}
          className="text-ink-500 hover:text-primary-700 shrink-0 text-xs hover:underline"
        >
          Market →
        </Link>
      </div>
      <div className="text-ink-700 text-sm">{summary(buckets)}</div>
      <div
        className="relative flex gap-0.5 pt-4"
        role="img"
        aria-label={`${title}: ${buckets
          .map((b) => `${b.text} ${formatOdds(b.p)}`)
          .join(', ')}`}
      >
        {buckets.map((b, i) => {
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
              <span
                className="flex h-9 items-center justify-center rounded-sm text-xs font-semibold tabular-nums"
                style={{ backgroundColor: fill, color: labelInk(fill) }}
              >
                {formatOdds(b.p)}
              </span>
              <span className="text-ink-600 truncate text-center text-[11px] tabular-nums">
                {b.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
