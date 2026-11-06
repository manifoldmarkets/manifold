import { formatOdds } from 'web/components/usa-map/election-display'
import { lookupCandidate } from 'web/lib/politics/candidates'
import type { Mover, RaceChart } from 'web/lib/politics/elections-2028'
import { CandidateAvatar, PhotoCredits } from './candidate-avatar'

const RACE_NAME: Record<string, string> = {
  president: 'To win the presidency',
  demNominee: 'Democratic nominee',
  gopNominee: 'Republican nominee',
}

// This week's biggest moves across the three races: one card per person,
// their biggest move.
export function MoversStrip(props: { movers: Mover[]; charts: RaceChart[] }) {
  const { movers } = props
  if (movers.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {movers.map((m) => {
          const candidate = lookupCandidate(m.text)
          const pts = Math.round(m.weekChange * 100)
          const party =
            m.chart === 'demNominee'
              ? 'D'
              : m.chart === 'gopNominee'
              ? 'R'
              : candidate.party
          return (
            <div
              key={`${m.chart}-${m.answerId}`}
              className="bg-canvas-0 border-ink-200 flex w-40 shrink-0 snap-start flex-col gap-2 rounded-xl border p-3 sm:w-auto"
            >
              <div className="flex items-center gap-2">
                <CandidateAvatar
                  candidate={candidate}
                  size={36}
                  party={party}
                />
                <span className="text-ink-900 min-w-0 truncate text-sm font-semibold">
                  {candidate.shortName}
                </span>
              </div>
              <span className="text-ink-1000 text-2xl font-semibold leading-none">
                <span aria-hidden className="mr-1 text-base">
                  {pts > 0 ? '▲' : '▼'}
                </span>
                {pts > 0 ? '+' : '−'}
                {Math.abs(pts)}
                <span className="text-ink-600 ml-1 text-sm font-normal">
                  pts
                </span>
              </span>
              <span className="text-ink-600 text-xs leading-snug">
                {RACE_NAME[m.chart] ?? ''} · now {formatOdds(m.prob)}
              </span>
            </div>
          )
        })}
      </div>
      <PhotoCredits candidates={movers.map((m) => lookupCandidate(m.text))} />
    </div>
  )
}
