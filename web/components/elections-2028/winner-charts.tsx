import { sortBy } from 'lodash'
import { useMemo } from 'react'

import { getAnswerProbability } from 'common/calculate'
import { Contract, isMultiCpmm, MultiContract } from 'common/contract'
import { useLiveContract } from 'web/hooks/use-contract'
import {
  Bucket,
  orderedBuckets,
  winnerBuckets,
} from 'web/lib/politics/election-glance'
import { dayAgoProbs } from 'web/lib/politics/senate-seats'
import { settledOrPrice } from 'web/lib/politics/settlement'
import { track } from 'web/lib/service/analytics'
import { BucketChart, ChartBar } from './bucket-chart'
import { OddsRows, oddsItem } from './odds-rows'

// Who wins the presidency and by how much, as bar charts that read like the
// seat charts: the Democrat winning on the left (as the party bars above),
// from their landslide in to the closest results, then the Republican
// winning, out to theirs.

// A resolved market reads by its result, not its last prices.
const bucketsOf = (c: MultiContract, threshold: number) =>
  orderedBuckets(
    c.answers.map((a) => ({
      id: a.id,
      text: a.text,
      p: settledOrPrice(c, a.id, (id) => getAnswerProbability(c, id)),
    })),
    threshold
  )

const withDayAgo = (
  bars: Bucket[],
  live: MultiContract,
  dayAgo: Record<string, number>
): ChartBar[] =>
  bars.map((b) => ({
    ...b,
    dayAgo: live.isResolved ? undefined : dayAgo[b.id],
  }))

const symbolOf = (b: Bucket) => (b.side === 'tie' ? undefined : b.side)

// A market whose answers stop reading as ranges is still on the page, as a
// line.
function Fallback(props: { contract: Contract; title: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-ink-1000 text-sm font-semibold">{props.title}</h3>
      <OddsRows
        items={[oddsItem(props.contract)]}
        columns={1}
        trackingName="election winner chart fallback"
      />
    </div>
  )
}

// The Democratic nominee's electoral votes (the market counts theirs), read
// as the winner's: "230–269" for the Democrat is the Republican's
// "269–308", which holds a 269–269 tie.
export function ElectoralVotesChart(props: { contract: Contract }) {
  const { contract } = props
  if (!isMultiCpmm(contract)) return null
  return <ElectoralVotes contract={contract} />
}

function ElectoralVotes(props: { contract: MultiContract }) {
  const live = useLiveContract(props.contract)
  const dayAgo = useMemo(() => dayAgoProbs(props.contract), [props.contract])
  const dem = useMemo(() => bucketsOf(live, 270), [live])
  const bars = useMemo(
    () => (dem ? winnerBuckets(dem, 538, 270) : undefined),
    [dem]
  )
  const title = 'Electoral votes'
  if (!dem || !bars) return <Fallback contract={live} title={title} />
  return (
    <BucketChart
      contract={live}
      bars={withDayAgo(bars, live, dayAgo)}
      title={title}
      info="The market counts the Democratic nominee's electoral votes. The Republican's are 538 minus those, if every elector votes for one of the two, so the Democrat's 230–269 is the Republican's 269–308. At 269–269 the House picks the president."
      unit="electoral votes"
      outcome={(side) =>
        side === 'D' ? 'Democrat wins' : 'Republican wins or ties'
      }
      shortOutcome={(side) => (side === 'D' ? 'D 270+' : 'R 269+')}
      symbol={symbolOf}
      rule="270 to win; at 269–269 the House picks"
      barName={(b) =>
        `${b.side === 'D' ? 'Democratic' : 'Republican'} nominee wins ${
          b.text
        } electoral votes`
      }
      note={(b) => {
        if (b.side !== 'R') return undefined
        const answer = dem.find((x) => x.id === b.id)
        return answer
          ? `The Republican nominee winning ${b.text} electoral votes is the same outcome as the Democratic nominee winning ${answer.text}, so this bets on that answer.`
          : undefined
      }}
      trackingName="election electoral votes chart"
      trackBet={(b) =>
        track('click election bucket bar', {
          chart: 'electoral votes',
          bar: b.text,
        })
      }
    />
  )
}

// The popular-vote margin (the Democrat's share minus the Republican's),
// the Democrat's widest win first.
export function PopularVoteMarginChart(props: {
  contract: Contract
  bare?: boolean
}) {
  const { contract } = props
  if (!isMultiCpmm(contract)) return null
  return <Margin contract={contract} bare={props.bare} />
}

function Margin(props: { contract: MultiContract; bare?: boolean }) {
  const live = useLiveContract(props.contract)
  const dayAgo = useMemo(() => dayAgoProbs(props.contract), [props.contract])
  const dem = useMemo(() => bucketsOf(live, 0), [live])
  const title = 'By how much'
  if (!dem) return <Fallback contract={live} title={title} />
  const bars = sortBy(dem, (b) => -b.at)
  return (
    <BucketChart
      contract={live}
      bars={withDayAgo(bars, live, dayAgo)}
      title={title}
      info="The Democratic nominee's share of the national popular vote minus the Republican nominee's, in percentage points."
      unit=""
      outcome={(side) => (side === 'D' ? 'Democrat wins' : 'Republican wins')}
      shortOutcome={(side) => (side === 'D' ? 'D wins' : 'R wins')}
      symbol={symbolOf}
      barName={(b) => `Popular-vote margin ${b.text}`}
      trackingName="election popular vote margin chart"
      trackBet={(b) =>
        track('click election bucket bar', {
          chart: 'popular vote margin',
          bar: b.text,
        })
      }
      bare={props.bare}
    />
  )
}
