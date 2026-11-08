import Link from 'next/link'
import { maxBy } from 'lodash'
import { ReactNode } from 'react'

import { getAnswerProbability } from 'common/calculate'
import { Contract, contractPath, isMultiCpmm } from 'common/contract'
import { formatOdds, labelInk } from 'web/components/usa-map/election-display'
import {
  DEM_DARK_HEX,
  hexToRgb,
  REP_DARK_HEX,
} from 'web/components/usa-map/state-election-map'
import { useLiveContract } from 'web/hooks/use-contract'
import { Bucket, orderedBuckets } from 'web/lib/politics/election-glance'

// A market over ordered ranges (electoral votes, the popular-vote margin)
// as one strip: a cell per range in scale order, shaded by its chance in
// the colour of the side it falls on, with a line where one side becomes
// the other (270 electoral votes, an even vote). Reads at a glance where the
// mass of the bets sits and how much of it is past the line.

const mix = (hex: string, t: number) => {
  const c = hexToRgb(hex)
  const ch = (v: number) =>
    Math.round(255 + (v - 255) * Math.max(0, Math.min(1, t)))
      .toString(16)
      .padStart(2, '0')
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`
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
  if (!isMultiCpmm(contract)) return null
  const buckets = orderedBuckets(
    contract.answers.map((a) => ({
      id: a.id,
      text: a.text,
      p: getAnswerProbability(contract, a.id),
    })),
    threshold
  )
  if (!buckets) return null
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
          const fill = mix(
            b.side === 'D' ? DEM_DARK_HEX : REP_DARK_HEX,
            0.12 + 0.88 * (b.p / top)
          )
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
