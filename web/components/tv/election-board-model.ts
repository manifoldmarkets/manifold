import { sortBy } from 'lodash'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { Contract, isMultiCpmm } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import {
  buildRaces,
  ElectionMode,
  leadingParty,
  Odds,
  outcomeLabel,
  Race,
} from 'web/components/usa-map/election-map-model'
import {
  complementParty,
  sourceAudit,
} from 'web/components/usa-map/audited-sources'
import {
  BALLOT_MEASURES,
  BallotMeasure,
} from 'web/components/usa-map/ballot-measures-model'
import {
  binaryRows,
  OutcomeParty,
  partyLabel,
} from 'web/components/usa-map/race-outcomes'
import {
  isDemocraticAnswer,
  isRepublicanAnswer,
} from 'web/components/usa-map/state-election-map'

// Manifold TV's election board: every race on the map in one list, so a
// viewer can see what is moving, follow races and bet without the map.
// Display only: nothing here prices or places a bet.

export const BOARD_MODES = ['senate', 'governor', 'house'] as const

// A race with an id unique across offices (Senate and Governor share "PA").
export type BoardRace = Race & { key: string; mode: ElectionMode }

export type BoardContracts = {
  senate: MapContractsDictionary
  governor: MapContractsDictionary
  house: Contract | null
  additionalHouse: MapContractsDictionary
}

export const raceKey = (mode: ElectionMode, id: string) => `${mode}:${id}`

export function boardRaces(contracts: BoardContracts): BoardRace[] {
  return BOARD_MODES.flatMap((mode) =>
    buildRaces(
      mode,
      mode === 'senate'
        ? contracts.senate
        : mode === 'governor'
        ? contracts.governor
        : {},
      contracts.house,
      contracts.additionalHouse
    ).map((race) => ({ ...race, key: raceKey(mode, race.id), mode }))
  )
}

// A race the market prices: not a same-party ballot, a decided seat or a
// candidate-only bet, and with party odds.
export const isPricedRace = (race: Race) =>
  !!race.contract &&
  !!race.odds &&
  (race.basis === undefined || race.basis.kind === 'market')

const clampProb = (p: number) => Math.min(1, Math.max(0, p))
const dayChange = (change: number | undefined) =>
  change !== undefined && Number.isFinite(change) ? change : 0

const isResolvedAnswer = (answer: Answer) =>
  !!answer.resolution && answer.resolution !== 'CANCEL'

// The contract as it was priced a day ago, from its probChanges. Both price
// readers (getDisplayProbability and getAnswerProbability) honour a pinned
// resolutionProbability, so pinning each price there lets buildRaces run
// unchanged, audits and complement folding included. Never sent anywhere.
// Settled markets keep their final prices: a call is not a move.
// Use it on a snapshot whose prices and probChanges were read together (a
// page's props), never on live-updated contracts: a live bet moves the price
// but not probChanges, which would drag the baseline along with it.
export function pricedADayAgo(contract: Contract): Contract {
  if (contract.isResolved) return contract
  if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY')
    return {
      ...contract,
      resolutionProbability: clampProb(
        contract.prob - dayChange(contract.probChanges?.day)
      ),
    }
  if (isMultiCpmm(contract))
    return {
      ...contract,
      answers: contract.answers.map((answer) =>
        answer.resolution
          ? answer
          : {
              ...answer,
              resolution: 'MKT' as const,
              resolutionProbability: clampProb(
                answer.prob - dayChange(answer.probChanges?.day)
              ),
            }
      ),
    }
  return contract
}

const dayAgoDictionary = (d: MapContractsDictionary) =>
  Object.fromEntries(
    Object.entries(d).map(([key, c]) => [key, c && pricedADayAgo(c)])
  )

export function boardRacesADayAgo(contracts: BoardContracts) {
  return boardRaces({
    senate: dayAgoDictionary(contracts.senate),
    governor: dayAgoDictionary(contracts.governor),
    house: contracts.house && pricedADayAgo(contracts.house),
    additionalHouse: dayAgoDictionary(contracts.additionalHouse),
  })
}

export type RaceMove = {
  race: BoardRace
  // The outcome that gained the most, and by how much (0 to 1).
  gainer: keyof Odds
  gain: number
  // The leader changed: "flipped to R".
  flipped: boolean
}

// How a race moved between two pricings: the outcome that gained the most.
// The odds are normalized, so gains and losses cancel; the largest gain is
// who the market is moving toward.
export function raceMove(
  now: BoardRace,
  then: Race | undefined
): RaceMove | undefined {
  if (!then?.odds || !now.odds || !isPricedRace(now) || !isPricedRace(then))
    return undefined
  let gainer: keyof Odds | undefined
  let gain = 0
  for (const [outcome, p] of Object.entries(now.odds) as [
    keyof Odds,
    number
  ][]) {
    const delta = p - (then.odds[outcome] ?? 0)
    if (Number.isFinite(delta) && delta > gain) {
      gain = delta
      gainer = outcome
    }
  }
  if (!gainer) return undefined
  const before = leadingParty(then.odds)
  const after = leadingParty(now.odds)
  return {
    race: now,
    gainer,
    gain,
    flipped: !!before && !!after && before !== after,
  }
}

// Open races that moved at least `minGain` (one point by default) in the
// last day, biggest first.
export function biggestMovers(
  now: BoardRace[],
  dayAgo: BoardRace[],
  minGain = 0.01
): RaceMove[] {
  const before = new Map(dayAgo.map((r) => [r.key, r]))
  const moves = now
    .filter((race) => !raceCall(race))
    .map((race) => raceMove(race, before.get(race.key)))
    .filter((m): m is RaceMove => !!m && m.gain >= minGain)
  return sortBy(moves, (m) => -m.gain)
}

// Open, priced races closest to even, by the leader's margin.
export function closestRaces(races: BoardRace[], limit = 25): BoardRace[] {
  const contested = races.filter(
    (race) => isPricedRace(race) && !raceCall(race)
  )
  return sortBy(contested, (race) => {
    const leader = leadingParty(race.odds)
    const p = leader ? race.odds?.[leader] ?? 1 : 0.5
    return Math.abs(p - 0.5)
  }).slice(0, limit)
}

export type RaceCall = { race: BoardRace; time?: number }

// A race whose market has settled: the whole market, or a House district's
// own answer in a portfolio market.
export function raceCall(race: BoardRace): RaceCall | undefined {
  const { contract, answerId } = race
  if (!contract) return undefined
  if (answerId && isMultiCpmm(contract)) {
    const answer = contract.answers.find((a) => a.id === answerId)
    return answer && isResolvedAnswer(answer)
      ? { race, time: answer.resolutionTime }
      : undefined
  }
  return contract.isResolved && contract.resolution !== 'CANCEL'
    ? { race, time: contract.resolutionTime }
    : undefined
}

export function latestCalls(races: BoardRace[]): RaceCall[] {
  const calls = races
    .map(raceCall)
    .filter((c): c is RaceCall => !!c && isPricedRace(c.race))
  return sortBy(calls, (c) => -(c.time ?? 0))
}

// "R 61%", "Even", or the race's basis when it is not priced.
export function leaderText(race: Race) {
  const leader = leadingParty(race.odds)
  if (!race.odds) return 'No odds'
  if (!leader) return 'Even'
  return `${outcomeLabel(leader)} ${Math.round(
    (race.odds[leader] ?? 0) * 100
  )}%`
}

// Map tones for an outcome key: the CSS module's data-tone values.
export const outcomeTone = (outcome: keyof Odds | undefined) =>
  outcome === 'dem'
    ? 'dem'
    : outcome === 'rep'
    ? 'rep'
    : outcome === 'other'
    ? 'other'
    : undefined

// Watchlist ----------------------------------------------------------------

// The account's stake in one market, or in one answer of it.
export type BoardPosition = {
  hasShares: boolean
  // Current value of the shares held, and profit to date (realised included).
  payout: number
  profit: number
  lastBetTime: number
}

// A market's whole-market position (answerId null) or one answer's.
export const positionKey = (contractId: string, answerId?: string | null) =>
  answerId ? `${contractId}:${answerId}` : contractId

// The account's positions, valued at the markets' current (live) prices with
// the same helper the backend uses to revalue metrics. The stored metrics
// carry shares and cash flows; their payout and profit are as of the last
// write, so they are recomputed here on every price change. A multi-choice
// summary is rebuilt from its answers; it holds shares if any answer does
// (the database sets that by trigger).
export function boardPositions(
  contracts: Contract[],
  metricsByContract: Record<string, ContractMetric[]>
): Map<string, BoardPosition> {
  const { metricsByContract: valued } = calculateUpdatedMetricsForContracts(
    contracts
      .filter((c) => metricsByContract[c.id]?.length)
      .map((contract) => ({
        contract,
        metrics: metricsByContract[contract.id],
      }))
  )
  const out = new Map<string, BoardPosition>()
  for (const [contractId, metrics] of Object.entries(valued)) {
    const anyShares = metrics.some((m) => m.answerId !== null && m.hasShares)
    for (const m of metrics) {
      const isMultiSummary = m.answerId === null && metrics.length > 1
      out.set(positionKey(contractId, m.answerId), {
        hasShares: isMultiSummary ? anyShares : m.hasShares,
        payout: m.payout,
        profit: m.profit,
        lastBetTime: m.lastBetTime,
      })
    }
  }
  return out
}

// The board's markets that are not races: chamber control and the ballot
// measures on the map's Measures tab.
export type BoardMarket = {
  key: string
  label: string
  detail: string
  contract: Contract
  // A measure priced by one answer of a portfolio market.
  answerId?: string
  measure?: BallotMeasure
  chamber?: 'Senate' | 'House'
}

export const isBoardRace = (item: BoardRace | BoardMarket): item is BoardRace =>
  'mode' in item

export function boardMarkets(contracts: {
  senateControl: Contract | null
  houseControl: Contract | null
  measures: MapContractsDictionary
}): { control: BoardMarket[]; measures: BoardMarket[] } {
  const control = (
    [
      ['senate', 'Senate', contracts.senateControl],
      ['house', 'House', contracts.houseControl],
    ] as const
  ).flatMap(([key, chamber, contract]) =>
    contract
      ? [
          {
            key: `control:${key}`,
            label: `${chamber} control`,
            detail: 'Which party controls the chamber',
            contract,
            chamber,
          },
        ]
      : []
  )
  const measures = BALLOT_MEASURES.flatMap((measure) => {
    const source = measure.source
    const contract = source && contracts.measures[source.contractId]
    if (!source || !contract) return []
    return [
      {
        key: `measure:${measure.key}`,
        label: `${measure.state} ${measure.designation ?? measure.title}`,
        detail: measure.designation ? measure.title : 'Ballot measure',
        contract,
        answerId:
          source.kind === 'portfolio-answer' ? source.answerId : undefined,
        measure,
      },
    ]
  })
  return { control, measures }
}

// Anything on the board with a market: a race or another board market.
type Watchable = { key: string; contract?: Contract; answerId?: string }

// The position in an item's own market, or, for one priced by an answer of
// a portfolio market (a House district, some measures), in that answer only.
export const itemPosition = (
  item: Watchable,
  positions: Map<string, BoardPosition>
) =>
  item.contract
    ? positions.get(positionKey(item.contract.id, item.answerId))
    : undefined

// Liking needs a market of the item's own: liking a portfolio market would
// like every district (or measure) it prices.
export const likeableContractId = (item: Watchable) =>
  item.contract && !item.answerId ? item.contract.id : undefined

export type Watchlist<T> = {
  // Traded on: open positions first, then the most recently traded.
  traded: { item: T; position: BoardPosition }[]
  // Liked and not traded, in board order.
  liked: T[]
}

export function watchlist<T extends Watchable>(
  items: T[],
  liked: Set<string>,
  positions: Map<string, BoardPosition>
): Watchlist<T> {
  const traded: Watchlist<T>['traded'] = []
  const likedOnly: T[] = []
  for (const item of items) {
    const position = itemPosition(item, positions)
    const likeable = likeableContractId(item)
    if (position) traded.push({ item, position })
    else if (likeable && liked.has(likeable)) likedOnly.push(item)
  }
  return {
    traded: sortBy(traded, [
      (t) => (t.position.hasShares ? 0 : 1),
      (t) => -t.position.lastBetTime,
    ]),
    liked: likedOnly,
  }
}

// Trades -------------------------------------------------------------------

// What a bet on one market or answer means in race terms, in the map's own
// words: `yes` is what a YES bet backs (a party, or a candidate's name), `no`
// what a NO bet backs.
export type TradeTarget = {
  label: string
  mode?: ElectionMode
  raceKey?: string
  yes: string
  no?: string
  yesTone?: 'dem' | 'rep' | 'other'
  noTone?: 'dem' | 'rep' | 'other'
}

const partyTone = (party: OutcomeParty) =>
  party === 'D'
    ? 'dem'
    : party === 'R'
    ? 'rep'
    : party === 'any' || party === 'unknown'
    ? undefined
    : 'other'

const answerParty = (contract: Contract, answer: Answer) => {
  const audited = sourceAudit(contract.slug)
  const party =
    audited?.contractId === contract.id
      ? audited.answerParties?.[answer.id]
      : undefined
  if (party === 'D' || party === 'R') return party
  if (isDemocraticAnswer(answer.text)) return 'D'
  if (isRepublicanAnswer(answer.text)) return 'R'
  return undefined
}

// Index every board market (and House portfolio answer) by the ids a bet
// carries: `${contractId}` or `${contractId}:${answerId}`.
export function tradeTargets(
  races: BoardRace[],
  control: { senate: Contract | null; house: Contract | null }
): Map<string, TradeTarget> {
  const targets = new Map<string, TradeTarget>()
  for (const [label, contract] of [
    ['Senate control', control.senate],
    ['House control', control.house],
  ] as const) {
    if (contract)
      targets.set(contract.id, {
        label,
        yes: partyLabel('R'),
        no: partyLabel('D'),
        yesTone: 'rep',
        noTone: 'dem',
      })
  }
  for (const race of races) {
    const { contract, answerId } = race
    if (!contract) continue
    const base = { label: race.label, mode: race.mode, raceKey: race.key }
    if (answerId) {
      // House portfolios price the Democrat winning each district; NO is the
      // Republican where one is on the ballot, as in the map's district rows.
      const noIsRep = complementParty('house', race.id, 'D') === 'R'
      targets.set(`${contract.id}:${answerId}`, {
        ...base,
        yes: partyLabel('D'),
        no: noIsRep ? partyLabel('R') : `Not ${partyLabel('D')}`,
        yesTone: 'dem',
        noTone: noIsRep ? 'rep' : undefined,
      })
    } else if (
      contract.mechanism === 'cpmm-1' &&
      contract.outcomeType === 'BINARY'
    ) {
      // The map's own rows: a candidate binary is a bet on the named
      // candidate, NO on any other winner.
      const rows = binaryRows(contract, race, race.mode)
      targets.set(contract.id, {
        ...base,
        yes: rows.YES.label,
        no: rows.NO.label,
        yesTone: partyTone(rows.YES.party),
        noTone: partyTone(rows.NO.party),
      })
    } else if (isMultiCpmm(contract)) {
      for (const answer of contract.answers) {
        const party = answerParty(contract, answer)
        const yes = party ? partyLabel(party) : answer.text
        targets.set(`${contract.id}:${answer.id}`, {
          ...base,
          yes,
          no: `Not ${yes}`,
          yesTone: party ? partyTone(party) : undefined,
        })
      }
    }
  }
  return targets
}

export type BoardTrade = {
  bet: Bet
  target: TradeTarget
  side: string
  tone?: 'dem' | 'rep' | 'other'
  // The backed side's chance before and after the trade.
  from: number
  to: number
  sold: boolean
}

export const MIN_TRADE = 10

// The trades worth showing: board markets only, at least MIN_TRADE, and one
// per trade (a multi-choice bet arrives with its arbitrage fills on the other
// answers, sharing its betGroupId).
export function boardTrades(
  bets: Bet[],
  targets: Map<string, TradeTarget>
): BoardTrade[] {
  const largest = new Map<string, Bet>()
  for (const bet of bets) {
    if (bet.isRedemption || !Number.isFinite(bet.amount)) continue
    if (Math.abs(bet.amount) < MIN_TRADE) continue
    const key = `${bet.userId}:${bet.contractId}:${
      bet.betGroupId ?? bet.createdTime
    }`
    const current = largest.get(key)
    if (!current || Math.abs(bet.amount) > Math.abs(current.amount))
      largest.set(key, bet)
  }
  const trades: BoardTrade[] = []
  for (const bet of largest.values()) {
    const target =
      (bet.answerId && targets.get(`${bet.contractId}:${bet.answerId}`)) ||
      targets.get(bet.contractId)
    if (!target || (bet.outcome !== 'YES' && bet.outcome !== 'NO')) continue
    const yes = bet.outcome === 'YES'
    const side = yes ? target.yes : target.no ?? `No · ${target.yes}`
    const flip = (p: number) => (yes ? p : 1 - p)
    trades.push({
      bet,
      target,
      side,
      tone: yes ? target.yesTone : target.noTone,
      from: flip(bet.probBefore),
      to: flip(bet.probAfter),
      sold: bet.amount < 0,
    })
  }
  return trades
}
