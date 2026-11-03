import { sortBy } from 'lodash'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { Contract, isMultiCpmm } from 'common/contract'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import {
  buildRaces,
  ElectionMode,
  leadingParty,
  Odds,
  outcomeLabel,
  Race,
} from 'web/components/usa-map/election-map-model'
import { sourceAudit } from 'web/components/usa-map/audited-sources'
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

// Trades -------------------------------------------------------------------

// What a bet on one market or answer means in race terms. `yes` is the party
// (or answer) a YES bet backs, and `no` what a NO bet backs, when that is a
// single party.
export type TradeTarget = {
  label: string
  mode?: ElectionMode
  raceKey?: string
  yes: string
  no?: string
  yesTone?: 'dem' | 'rep' | 'other'
  noTone?: 'dem' | 'rep' | 'other'
}

const partyTone = (party: string) =>
  party === 'D' ? 'dem' : party === 'R' ? 'rep' : 'other'

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

// Who a binary market's YES stands for: the audit's party, else Republican,
// which is what the map assumes of its curated binaries (electionOdds).
const binaryYesParty = (contract: Contract) => {
  const audited = sourceAudit(contract.slug)
  return audited?.contractId === contract.id && audited.binaryYes
    ? audited.binaryYes
    : 'R'
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
        yes: 'R',
        no: 'D',
        yesTone: 'rep',
        noTone: 'dem',
      })
  }
  for (const race of races) {
    const { contract, answerId } = race
    if (!contract) continue
    const base = { label: race.label, mode: race.mode, raceKey: race.key }
    if (answerId) {
      // House portfolios price the Democrat winning each district.
      targets.set(`${contract.id}:${answerId}`, {
        ...base,
        yes: 'D',
        no: 'Not D',
        yesTone: 'dem',
      })
    } else if (
      contract.mechanism === 'cpmm-1' &&
      contract.outcomeType === 'BINARY'
    ) {
      const yes = binaryYesParty(contract)
      targets.set(contract.id, {
        ...base,
        yes,
        no: `Not ${yes}`,
        yesTone: partyTone(yes),
      })
    } else if (isMultiCpmm(contract)) {
      for (const answer of contract.answers) {
        const party = answerParty(contract, answer)
        targets.set(`${contract.id}:${answer.id}`, {
          ...base,
          yes: party ?? answer.text,
          no: `Not ${party ?? answer.text}`,
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

// The trades worth showing from one broadcast: board markets only, at least
// MIN_TRADE, and one per trader and market (a multi-choice bet arrives with
// its arbitrage fills on the other answers).
export function boardTrades(
  bets: Bet[],
  targets: Map<string, TradeTarget>
): BoardTrade[] {
  const largest = new Map<string, Bet>()
  for (const bet of bets) {
    if (bet.isRedemption || !Number.isFinite(bet.amount)) continue
    if (Math.abs(bet.amount) < MIN_TRADE) continue
    const key = `${bet.userId}:${bet.contractId}`
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
