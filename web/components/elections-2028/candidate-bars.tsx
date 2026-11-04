import Link from 'next/link'
import { useState } from 'react'
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
import { track } from 'web/lib/service/analytics'
import { AnswerBetModal } from './answer-bet-modal'
import { CandidateAvatar, PhotoCredits } from './candidate-avatar'
import { OTHER_PARTY_COLOR } from './race-series'

// A market's leading people as face + bar rows: running mates and the
// winning ticket. Bars take the person's party colour; the number is ink.
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
  const [betId, setBetId] = useState<string | undefined>()
  if (!isMultiCpmm(contract)) return null
  const ranked = sortBy(
    contract.answers.filter((a) => isCandidateAnswer(a.text) && !a.resolution),
    (a) => -getAnswerProbability(contract, a.id)
  ).slice(0, rows)
  const max = Math.max(
    ...ranked.map((a) => getAnswerProbability(contract, a.id)),
    0.01
  )
  const betAnswer = contract.answers.find((a) => a.id === betId)

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
          const p = getAnswerProbability(contract, a.id)
          const who = party ?? candidate.party
          const color =
            who === 'D'
              ? DEM_COLOR
              : who === 'R'
              ? REP_COLOR
              : OTHER_PARTY_COLOR
          return (
            <li key={a.id}>
              <button
                type="button"
                className="hover:bg-canvas-50 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-lg px-1 py-0.5 text-left"
                onClick={() => {
                  track('bet intent', { location: trackingName })
                  setBetId(a.id)
                }}
                aria-label={`Bet on ${candidate.name}, ${formatOdds(p)}`}
              >
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
                  {formatOdds(p)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <PhotoCredits candidates={ranked.map((a) => lookupCandidate(a.text))} />
      <AnswerBetModal
        contract={contract}
        answer={betAnswer}
        onClose={() => setBetId(undefined)}
      />
    </div>
  )
}
