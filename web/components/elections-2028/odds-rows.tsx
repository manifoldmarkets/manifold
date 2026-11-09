import clsx from 'clsx'

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract, isMultiCpmm } from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import { leadingAnswer } from 'web/lib/politics/election-glance'
import { rankedAnswers } from 'web/lib/politics/settlement'
import { LiveContracts } from './live-contracts'
import { BetTarget, useQuickBet } from './quick-bet'

// Markets that don't need a picture of their own, one line each: what it
// asks, the pick (for a market with several answers), a thin bar and the
// chance. Clicking a line bets on what it shows, without leaving the page.
// Two columns from tablet width.

export type OddsItem = {
  key: string
  label: string
  // The answer the chance is for, where the market has several.
  pick?: string
  // Absent for a market with no single chance to show (a numeric market,
  // a poll).
  p?: number
  bet: BetTarget
}

export function OddsRows(props: {
  items: OddsItem[]
  trackingName: string
  columns?: 1 | 2
  className?: string
}) {
  const { items, trackingName, columns = 2, className } = props
  const { open, dialog } = useQuickBet(trackingName)
  if (items.length === 0) return null
  return (
    <>
      <ul
        className={clsx(
          'grid gap-x-8',
          columns === 2 && 'md:grid-cols-2',
          className
        )}
      >
        {items.map((item) => (
          <li
            key={item.key}
            className="border-ink-200 border-b last:border-b-0"
          >
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`Bet: ${item.label}${
                item.pick ? `, ${item.pick}` : ''
              }${item.p !== undefined ? `, ${formatOdds(item.p)}` : ''}`}
              onClick={() => open(item.bet)}
              className="hover:bg-canvas-50 group -mx-2 grid w-[calc(100%+1rem)] grid-cols-[1fr_4.5rem_2.75rem] items-center gap-3 rounded-md px-2 py-2 text-left sm:grid-cols-[1fr_6rem_2.75rem]"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-ink-900 line-clamp-2 text-sm leading-snug">
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
                  Bet
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {dialog}
    </>
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
// answer of a market with several (a click bets on that answer); any other
// market as a line whose click opens its bet dialog. A market that resolves
// while the page is open shows its result, not its last price.
export function oddsItem(
  contract: Contract,
  label = contract.question
): OddsItem {
  const plain = { key: contract.id, label, bet: { contract } }
  if (contract.outcomeType === 'BINARY') {
    const p =
      contract.resolution === 'YES'
        ? 1
        : contract.resolution === 'NO'
        ? 0
        : getDisplayProbability(contract as BinaryContract)
    return Number.isFinite(p) ? { ...plain, p } : plain
  }
  if (isMultiCpmm(contract)) {
    const multi = contract
    // Resolved: what it paid most, Other included. Open: the leading pick.
    const settled = multi.isResolved && multi.resolution !== 'CANCEL'
    const top = settled
      ? rankedAnswers(multi, (id) => getAnswerProbability(multi, id), 1)[0]
      : undefined
    const lead = top
      ? { id: top.answer.id, text: top.answer.text, p: top.p }
      : leadingAnswer(
          multi.answers.map((a) => ({
            id: a.id,
            text: a.text,
            p: getAnswerProbability(multi, a.id),
          }))
        )
    return lead
      ? {
          ...plain,
          pick: lead.text,
          p: lead.p,
          bet: { contract, answerId: lead.id },
        }
      : plain
  }
  return plain
}

export const oddsItems = (
  contracts: Contract[],
  labelOf: (c: Contract) => string | undefined = () => undefined
) => contracts.map((c) => oddsItem(c, labelOf(c) ?? c.question))
