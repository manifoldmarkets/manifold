import clsx from 'clsx'
import Link from 'next/link'
import { sortBy } from 'lodash'

import { getAnswerProbability } from 'common/calculate'
import { Contract, contractPath, isMultiCpmm } from 'common/contract'
import { formatOdds, labelInk } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { FitText } from 'web/components/widgets/fit-text'
import { useLiveContract } from 'web/hooks/use-contract'
import { settledOrPrice } from 'web/lib/politics/settlement'
import { useQuickBet } from './quick-bet'

// The official balance-of-power market: who holds the presidency, Senate and
// House after an election, as its eight D/R combinations, most likely first.
// A column per office, headed by its name; each row's cells say which party
// holds it, in that party's colour, then the row's chance. Clicking a row
// bets on it without leaving the page.

const COMBO = /^([DR]) President, ([DR]) Senate, ([DR]) House/

const OFFICES = ['President', 'Senate', 'House'] as const

// The offices' cells, a bar for the chance, the chance; the header row uses
// the same columns so the office names sit over their cells.
const COLUMNS =
  'grid grid-cols-[repeat(3,minmax(0,3.75rem))_minmax(1.5rem,1fr)_2.75rem] items-center gap-x-1.5 sm:grid-cols-[repeat(3,minmax(0,4.75rem))_minmax(2rem,1fr)_3rem] sm:gap-x-2'

const PARTY = {
  D: { name: 'Democratic', short: 'Dem', color: DEM_COLOR },
  R: { name: 'Republican', short: 'Rep', color: REP_COLOR },
}

export function BalanceOfPower(props: {
  contract: Contract
  title: string
  rows?: number
}) {
  const contract = useLiveContract(props.contract)
  const { open, dialog } = useQuickBet('election balance of power')
  if (!isMultiCpmm(contract)) return null
  const answers = sortBy(
    contract.answers
      .map((a) => ({
        a,
        m: a.text.match(COMBO),
        // A resolved market by its result, not its last prices.
        p: settledOrPrice(contract, a.id, (id) =>
          getAnswerProbability(contract, id)
        ),
      }))
      .filter((x) => x.m),
    (x) => -x.p
  ).slice(0, props.rows ?? 8)
  const top = answers[0]?.p ?? 1
  return (
    <div className="bg-canvas-0 border-ink-200 flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-ink-1000 text-base font-semibold">{props.title}</h3>
        <Link
          href={contractPath(contract)}
          className="text-ink-500 hover:text-primary-700 shrink-0 text-xs hover:underline"
        >
          Market →
        </Link>
      </div>
      <div
        className={clsx(COLUMNS, 'text-ink-600 px-1 text-xs font-medium')}
        aria-hidden
      >
        {OFFICES.map((o) => (
          <FitText key={o} className="text-center">
            {o}
          </FitText>
        ))}
      </div>
      <ul className="flex flex-col gap-1">
        {answers.map(({ a, m, p }) => {
          const parties = [m![1], m![2], m![3]] as ('D' | 'R')[]
          const words = parties
            .map((x, i) => `${PARTY[x].name} ${OFFICES[i]}`)
            .join(', ')
          const trifecta = parties.every((x) => x === parties[0])
            ? ` (${PARTY[parties[0]].name} trifecta)`
            : ''
          return (
            <li key={a.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => open({ contract, answerId: a.id })}
                className={clsx(
                  COLUMNS,
                  'hover:bg-canvas-50 w-full rounded-md px-1 py-1 text-left'
                )}
                aria-label={`Bet on ${words}${trifecta}: ${formatOdds(p)}`}
              >
                {parties.map((x, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="flex h-7 items-center justify-center rounded-md text-xs font-semibold sm:text-sm"
                    style={{
                      backgroundColor: PARTY[x].color,
                      color: labelInk(PARTY[x].color),
                    }}
                  >
                    {PARTY[x].short}
                  </span>
                ))}
                <span className="bg-canvas-100 relative h-1.5 overflow-hidden rounded-full">
                  <span
                    className="bg-ink-500 absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${Math.max(2, (p / top) * 100)}%` }}
                  />
                </span>
                <span className="text-ink-1000 text-right text-sm font-semibold tabular-nums">
                  {formatOdds(p)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {dialog}
    </div>
  )
}
