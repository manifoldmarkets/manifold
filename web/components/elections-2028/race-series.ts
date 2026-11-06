import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import {
  CandidateInfo,
  CandidateParty,
  lookupCandidate,
} from 'web/lib/politics/candidates'
import type { RaceChart } from 'web/lib/politics/elections-2028'
import { decodeHistory, TimePoint } from 'web/lib/politics/race-history'

export const OTHER_PARTY_COLOR = '#8b8a84'

export type ChartSeries = {
  id: string
  text: string
  candidate: CandidateInfo
  party?: CandidateParty
  // A CSS colour: a palette variable (var(--s2)) or a party hex.
  color: string
  // The party chart draws each party's frontrunner bold and the rest lighter.
  emphasis: boolean
  prob: number
  weekChange: number
  points: TimePoint[]
}

// One series per listed answer, coloured by entity: the order is fixed when
// the page loads, so changing the range or live prices never repaints a line.
// `charted` series (the first `chartCount`) carry history; the rest are list
// rows only.
export function buildChartSeries(
  chart: RaceChart,
  liveContract: MultiContract,
  now: number
): ChartSeries[] {
  const partyOf = (c: CandidateInfo): CandidateParty | undefined =>
    chart.colorBy === 'dem' ? 'D' : chart.colorBy === 'gop' ? 'R' : c.party
  const firstOfParty = new Set<string>()
  return chart.series.map((s, i) => {
    const candidate = lookupCandidate(s.text)
    const party = partyOf(candidate)
    const answer = liveContract.answers.find((a) => a.id === s.answerId)
    const live = answer ? getAnswerProbability(liveContract, answer.id) : s.prob
    const prob = Number.isFinite(live) ? live : s.prob
    const points = decodeHistory(s.history)
    // The line ends at the live price.
    if (points.length > 0)
      points.push([Math.max(now, points[points.length - 1][0]), prob])
    let color: string
    let emphasis = true
    if (chart.colorBy === 'party') {
      color =
        party === 'D'
          ? DEM_COLOR
          : party === 'R'
          ? REP_COLOR
          : OTHER_PARTY_COLOR
      const partyKey = party ?? 'O'
      emphasis = !firstOfParty.has(partyKey)
      firstOfParty.add(partyKey)
    } else {
      color = `var(--s${Math.min(i, 5)})`
    }
    return {
      id: s.answerId,
      text: s.text,
      candidate,
      party,
      color,
      emphasis,
      prob,
      weekChange: s.weekChange + (prob - s.prob),
      points,
    }
  })
}

export const partyLabel = (party: CandidateParty | undefined) =>
  party === 'D' ? 'Democrat' : party === 'R' ? 'Republican' : 'Independent'
