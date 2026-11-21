import clsx from 'clsx'
import { useMemo } from 'react'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { getAnswerProbability } from 'common/calculate'
import { Contract, isMultiCpmm, MultiContract } from 'common/contract'
import { useLiveContract } from 'web/hooks/use-contract'
import {
  Bucket,
  orderedBuckets,
  otherNominee,
} from 'web/lib/politics/election-glance'
import { settledOrPrice } from 'web/lib/politics/settlement'
import { dayAgoProbs } from 'web/lib/politics/senate-seats'
import { track } from 'web/lib/service/analytics'
import { BucketChart, ChartBar, Party } from './bucket-chart'

// How many seats each party holds after an election, as the live 2026
// page's seat chart (BucketChart): one bar per range, shaded by who would
// run the chamber, with the chances 24 hours ago outlined behind. The markets
// ("How many Senate seats will Democrats hold", "How many House seats will
// Democrats win") count the Democrats'; one toggle over both charts reads
// them from the Republicans' side (100 or 435 minus each range). A 50–50
// Senate is neither party's majority: grey, with the line at 51.

type Chamber = {
  key: 'senate' | 'house'
  name: string
  total: number
  line: number
  tie?: number
  rule: string
  rules: (year: number) => string
}

const SENATE: Chamber = {
  key: 'senate',
  name: 'Senate',
  total: 100,
  line: 51,
  tie: 50,
  rule: '51 for a majority; the Vice President breaks a 50–50 tie',
  rules: (year) =>
    `Counts the senators in each party's caucus (independents with the party they caucus with) when the new Congress meets in January ${
      year + 1
    }: every seat, not only those up in ${year}. 51 is a majority; at 50–50 the Vice President's party runs the Senate. The market counts Democratic seats; Republican seats are the rest, assuming every senator caucuses with one of the two parties.`,
}

const HOUSE: Chamber = {
  key: 'house',
  name: 'House',
  total: 435,
  line: 218,
  rule: '218 for a majority',
  rules: (year) =>
    `Counts the House seats each party wins in the ${year} elections, runoffs included; independents count with the party they caucus with. 218 is a majority. The market counts Democratic seats; Republican seats are the rest, assuming every seat goes to one of the two parties.`,
}

const PARTY_NAME: Record<Party, string> = { D: 'Democratic', R: 'Republican' }

const outcomeOf = (side: Bucket['side']) =>
  side === 'tie'
    ? '50–50: the Vice President’s party'
    : `${PARTY_NAME[side]} majority`

export function SeatCharts(props: {
  senate?: Contract
  house?: Contract
  year: number
}) {
  const { senate, house, year } = props
  const [view, setView] = usePersistentInMemoryState<Party>(
    'D',
    `election-seat-charts-view-${year}`
  )
  if (!senate && !house) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <span className="text-ink-500 text-xs">Count seats for</span>
        <span
          role="group"
          aria-label="Whose seats"
          className="bg-canvas-50 flex shrink-0 rounded-md p-0.5 text-xs"
        >
          {(['D', 'R'] as const).map((party) => (
            <button
              key={party}
              type="button"
              aria-pressed={view === party}
              onClick={() => setView(party)}
              className={clsx(
                'rounded px-2 py-0.5',
                view === party
                  ? 'bg-canvas-0 text-ink-1000 font-semibold shadow-sm'
                  : 'text-ink-600 hover:text-ink-900'
              )}
            >
              {party === 'D' ? 'Democrats' : 'Republicans'}
            </button>
          ))}
        </span>
      </div>
      <div
        className={clsx(
          'grid items-start gap-4',
          senate && house && 'md:grid-cols-2'
        )}
      >
        {senate && (
          <SeatChart
            contract={senate}
            chamber={SENATE}
            year={year}
            view={view}
          />
        )}
        {house && (
          <SeatChart contract={house} chamber={HOUSE} year={year} view={view} />
        )}
      </div>
    </div>
  )
}

function SeatChart(props: {
  contract: Contract
  chamber: Chamber
  year: number
  view: Party
}) {
  const { contract } = props
  if (!isMultiCpmm(contract) || contract.outcomeType !== 'MULTIPLE_CHOICE')
    return null
  return <Chart {...props} contract={contract} />
}

// The chamber's bars, Democratic majorities on the left (as the other
// charts here and the party bars): the Democrats' ranges from most seats to
// fewest, or the Republicans' from fewest to most.
function Chart(props: {
  contract: MultiContract
  chamber: Chamber
  year: number
  view: Party
}) {
  const { chamber, year } = props
  const live = useLiveContract(props.contract)
  // 24h-ago chances come from the page snapshot, not the live market.
  const dayAgo = useMemo(() => dayAgoProbs(props.contract), [props.contract])
  const dem = useMemo(
    () =>
      orderedBuckets(
        live.answers.map((a) => ({
          id: a.id,
          text: a.text,
          // A resolved market by its result, not its last prices.
          p: settledOrPrice(live, a.id, (id) => getAnswerProbability(live, id)),
        })),
        chamber.line,
        chamber.tie
      ),
    [live, chamber]
  )
  const rep = useMemo(
    () =>
      dem
        ? otherNominee(dem, chamber.total, chamber.line, chamber.tie)
        : undefined,
    [dem, chamber]
  )
  // The Republican reading needs answers that read as counts.
  const view: Party = props.view === 'R' && rep ? 'R' : 'D'
  // Both start at the Democratic majorities: the Democrats' counts from the
  // most, the Republicans' (otherNominee, in their order) from the fewest.
  const bars: ChartBar[] = useMemo(
    () =>
      (view === 'R' ? rep ?? [] : [...(dem ?? [])].reverse()).map((b) => ({
        ...b,
        dayAgo: live.isResolved ? undefined : dayAgo[b.id],
      })),
    [view, rep, dem, dayAgo, live.isResolved]
  )
  if (!dem || !bars.length) return null
  const party = PARTY_NAME[view]
  const seatsWord = chamber.key === 'senate' ? 'holding' : 'winning'

  return (
    <BucketChart
      contract={live}
      bars={bars}
      title={`${party} ${chamber.name} seats after ${year}`}
      info={chamber.rules(year)}
      unit="seats"
      outcome={outcomeOf}
      shortOutcome={(side) => (side === 'tie' ? 'tie' : `${side} majority`)}
      symbol={() => view}
      rule={chamber.rule}
      barName={(b) => `${b.text} ${party} seats`}
      note={(b) => {
        const answer = dem.find((x) => x.id === b.id)
        return view === 'R' && answer
          ? `Republicans ${seatsWord} ${b.text} ${chamber.name} seats is the same outcome as Democrats ${seatsWord} ${answer.text}, so this bets on that answer.`
          : undefined
      }}
      trackingName={`election ${chamber.key} seats chart`}
      trackBet={(b) =>
        track('click election seats bar', {
          chamber: chamber.key,
          seats: b.text,
        })
      }
    />
  )
}
