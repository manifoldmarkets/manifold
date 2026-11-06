import Link from 'next/link'
import { sortBy } from 'lodash'

import { getAnswerProbability } from 'common/calculate'
import { Contract, contractPath, isMultiCpmm } from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { useLiveContract } from 'web/hooks/use-contract'

// The official balance-of-power market: who holds the presidency, Senate and
// House after an election, as its eight D/R combinations, most likely first.
// Each office is a pip in its party's colour; the label says it in words.

const COMBO = /^([DR]) President, ([DR]) Senate, ([DR]) House/

const OFFICES = ['President', 'Senate', 'House'] as const

export function BalanceOfPower(props: {
  contract: Contract
  title: string
  rows?: number
}) {
  const contract = useLiveContract(props.contract)
  if (!isMultiCpmm(contract)) return null
  const answers = sortBy(
    contract.answers
      .map((a) => ({
        a,
        m: a.text.match(COMBO),
        p: getAnswerProbability(contract, a.id),
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
          className="text-primary-700 hover:text-primary-800 shrink-0 text-sm font-medium hover:underline"
        >
          Bet →
        </Link>
      </div>
      <div className="text-ink-600 flex gap-3 text-xs" aria-hidden>
        {OFFICES.map((o) => (
          <span key={o} className="w-3 text-center">
            {o[0]}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {answers.map(({ a, m, p }) => {
          const parties = [m![1], m![2], m![3]] as ('D' | 'R')[]
          // "Democratic trifecta" where the answer names one; otherwise the
          // combination itself ("D President, R Senate, R House").
          const label =
            a.text.match(/\(([^)]+)\)/)?.[1] ?? a.text.replace(/\s*\(.*\)$/, '')
          const words = parties
            .map(
              (x, i) =>
                `${x === 'D' ? 'Democratic' : 'Republican'} ${OFFICES[i]}`
            )
            .join(', ')
          return (
            <li key={a.id}>
              <Link
                href={contractPath(contract)}
                className="hover:bg-canvas-50 -mx-1 flex items-center gap-3 rounded px-1 py-0.5"
                aria-label={`${words}: ${formatOdds(p)}`}
              >
                <span className="flex shrink-0 gap-3" aria-hidden>
                  {parties.map((x, i) => (
                    <span
                      key={i}
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{
                        backgroundColor: x === 'D' ? DEM_COLOR : REP_COLOR,
                      }}
                    />
                  ))}
                </span>
                <span className="text-ink-900 min-w-0 flex-1 truncate text-sm">
                  {label}
                </span>
                <span className="bg-canvas-100 relative hidden h-1.5 w-24 overflow-hidden rounded-full sm:block">
                  <span
                    className="bg-ink-500 absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${Math.max(2, (p / top) * 100)}%` }}
                  />
                </span>
                <span className="text-ink-1000 w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {formatOdds(p)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
