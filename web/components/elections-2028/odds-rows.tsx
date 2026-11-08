import clsx from 'clsx'
import Link from 'next/link'

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  contractPath,
  isMultiCpmm,
} from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import { leadingAnswer } from 'web/lib/politics/election-glance'
import { track } from 'web/lib/service/analytics'
import { LiveContracts } from './live-contracts'

// Markets that don't need a picture of their own, one line each: what it
// asks, the pick (for a market with several answers), a thin bar and the
// chance. Each line opens its market. Two columns from tablet width.

export type OddsItem = {
  key: string
  label: string
  // The answer the chance is for, where the market has several.
  pick?: string
  // Absent for a market with no single chance to show (a numeric market,
  // a poll): the line just opens it.
  p?: number
  href: string
}

export function OddsRows(props: {
  items: OddsItem[]
  trackingName: string
  columns?: 1 | 2
  className?: string
}) {
  const { items, trackingName, columns = 2, className } = props
  if (items.length === 0) return null
  return (
    <ul
      className={clsx(
        'grid gap-x-8',
        columns === 2 && 'md:grid-cols-2',
        className
      )}
    >
      {items.map((item) => (
        <li key={item.key} className="border-ink-200 border-b last:border-b-0">
          <Link
            href={item.href}
            onClick={() => track('click election odds row', { trackingName })}
            className="hover:bg-canvas-50 group -mx-2 grid grid-cols-[1fr_4.5rem_2.75rem] items-center gap-3 rounded-md px-2 py-2 sm:grid-cols-[1fr_6rem_2.75rem]"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-ink-900 line-clamp-2 text-sm leading-snug group-hover:underline">
                {item.label}
              </span>
              {item.pick && (
                <span className="text-ink-600 truncate text-xs">
                  {item.pick}
                </span>
              )}
            </span>
            {item.p !== undefined ? (
              <>
                <span
                  className="bg-ink-200 h-1.5 overflow-hidden rounded-full"
                  aria-hidden
                >
                  <span
                    className="bg-primary-500 block h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(1, item.p)) * 100}%`,
                    }}
                  />
                </span>
                <span className="text-ink-1000 text-right text-sm font-semibold tabular-nums">
                  {formatOdds(item.p)}
                </span>
              </>
            ) : (
              <span className="text-primary-700 col-span-2 text-right text-sm font-medium">
                Open →
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

// Markets as lines, kept live.
export function MarketRows(props: {
  contracts: Contract[]
  labelOf?: (c: Contract) => string | undefined
  trackingName: string
  columns?: 1 | 2
  className?: string
}) {
  const { contracts, labelOf, ...rest } = props
  if (contracts.length === 0) return null
  return (
    <LiveContracts contracts={contracts}>
      {(live) => <OddsRows items={oddsItems(live, labelOf)} {...rest} />}
    </LiveContracts>
  )
}

// A market as one line: a yes/no market's chance, or the leading named
// answer of a market with several; any other market as a line that opens it.
export function oddsItem(
  contract: Contract,
  label = contract.question
): OddsItem {
  const href = contractPath(contract)
  const plain = { key: contract.id, label, href }
  if (contract.outcomeType === 'BINARY') {
    const p = getDisplayProbability(contract as BinaryContract)
    return Number.isFinite(p) ? { ...plain, p } : plain
  }
  if (isMultiCpmm(contract)) {
    const multi = contract
    const lead = leadingAnswer(
      multi.answers.map((a) => ({
        id: a.id,
        text: a.text,
        p: getAnswerProbability(multi, a.id),
      }))
    )
    return lead ? { ...plain, pick: lead.text, p: lead.p } : plain
  }
  return plain
}

export const oddsItems = (
  contracts: Contract[],
  labelOf: (c: Contract) => string | undefined = () => undefined
) => contracts.map((c) => oddsItem(c, labelOf(c) ?? c.question))
