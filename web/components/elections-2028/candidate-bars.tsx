import clsx from 'clsx'
import Link from 'next/link'
import { sortBy } from 'lodash'

import { getAnswerProbability } from 'common/calculate'
import { Contract, contractPath, isMultiCpmm } from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { useLiveContract } from 'web/hooks/use-contract'
import {
  CandidateParty,
  isCandidateAnswer,
  lookupCandidate,
} from 'web/lib/politics/candidates'
import { resolvedAnswerId, settledOrPrice } from 'web/lib/politics/settlement'
import { useQuickBet } from './quick-bet'
import { CandidateAvatar, PhotoCredits } from './candidate-avatar'
import { OTHER_PARTY_COLOR } from './race-series'

// A market's leading people as face + bar rows: running mates and the
// winning ticket. Bars take the person's party colour; the number is ink.
// As answers settle, a winner stays, marked Won (independent answers, as on
// the winning ticket, resolve one by one), and a loser drops off.
export function CandidateBars(props: {
  contract: Contract
  title: string
  subtitle?: string
  party?: CandidateParty
  rows?: number
  trackingName: string
}) {
  const { title, subtitle, party, rows = 5, trackingName } = props
  const contract = useLiveContract(props.contract)
  const { open, dialog } = useQuickBet(trackingName)
  if (!isMultiCpmm(contract)) return null
  const prob = (id: string) =>
    settledOrPrice(contract, id, (x) => getAnswerProbability(contract, x))
  const settled = contract.isResolved && contract.resolution !== 'CANCEL'
  const winner = resolvedAnswerId(contract)
  const ranked = sortBy(
    contract.answers.filter(
      (a) =>
        isCandidateAnswer(a.text) &&
        a.resolution !== 'NO' &&
        a.resolution !== 'CANCEL' &&
        !(settled && prob(a.id) <= 0)
    ),
    (a) => -prob(a.id)
  ).slice(0, rows)
  const max = Math.max(...ranked.map((a) => prob(a.id)), 0.01)

  return (
    <div className="bg-canvas-0 border-ink-200 flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="text-ink-900 text-base font-semibold">{title}</h3>
          {subtitle && <span className="text-ink-600 text-xs">{subtitle}</span>}
        </div>
        <Link
          href={contractPath(contract)}
          className="text-ink-500 hover:text-primary-700 shrink-0 text-xs hover:underline"
        >
          Market →
        </Link>
      </div>
      <ol className="flex flex-col gap-2.5">
        {ranked.map((a) => {
          const candidate = lookupCandidate(a.text)
          const p = prob(a.id)
          const won = a.resolution === 'YES' || a.id === winner
          const who = party ?? candidate.party
          const color =
            who === 'D'
              ? DEM_COLOR
              : who === 'R'
              ? REP_COLOR
              : OTHER_PARTY_COLOR
          const body = (
            <>
              <CandidateAvatar candidate={candidate} size={30} party={who} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-ink-900 truncate text-sm font-medium">
                  {candidate.name}
                </span>
                <span className="bg-canvas-50 h-1.5 w-full overflow-hidden rounded-full">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(p / max) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                </span>
              </span>
              <span className="text-ink-900 w-11 shrink-0 text-right text-sm font-semibold tabular-nums">
                {won ? 'Won' : formatOdds(p)}
              </span>
            </>
          )
          const row =
            '-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-lg px-1 py-0.5 text-left'
          // A settled answer takes no more bets: the row shows its result.
          return (
            <li key={a.id}>
              {a.resolution || settled ? (
                <div className={row}>{body}</div>
              ) : (
                <button
                  type="button"
                  className={clsx(row, 'hover:bg-canvas-50')}
                  aria-haspopup="dialog"
                  onClick={() => open({ contract, answerId: a.id })}
                  aria-label={`Bet on ${candidate.name}, ${formatOdds(p)}`}
                >
                  {body}
                </button>
              )}
            </li>
          )
        })}
      </ol>
      <PhotoCredits candidates={ranked.map((a) => lookupCandidate(a.text))} />
      {dialog}
    </div>
  )
}
