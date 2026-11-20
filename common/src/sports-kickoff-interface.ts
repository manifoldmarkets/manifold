import {
  BDL_DEFAULT_STARTING_LIQUIDITY,
  BDL_KICKOFF_FUNDING,
} from './bdl/constants'
import { Contract, CPMMMultiContract, Sports, isMultiCpmm } from './contract'
import { MANIFOLD_SPORTS_USER_IDS } from './sports'
import { providerOf } from './sports-provider'

export const SPORTS_GAME_BASE_ANTE = BDL_DEFAULT_STARTING_LIQUIDITY
export const SPORTS_KICKOFF_BUDGET = BDL_KICKOFF_FUNDING.budget
export const SPORTS_KICKOFF_TARGET_WORST_CASE =
  BDL_KICKOFF_FUNDING.targetWorstCase
export const SPORTS_KICKOFF_FUNDING_ENABLED = BDL_KICKOFF_FUNDING.enabled

export type SportsKickoffMode = 'off' | 'dry-run' | 'drain' | 'live'
export type OpeningLineSource = 'polymarket' | 'kalshi' | 'books' | 'none'
export type SportsOpeningLine = {
  source: OpeningLineSource
  probs: number[]
  bookCount: number
  vendors: string[]
  sampledTime: number
}

export type SportsAnteDecision = {
  ante: number
  kickoffBudget?: number
  reason: string
}

export const isLinkedCpmmMulti2 = (c: Contract): c is CPMMMultiContract =>
  isMultiCpmm(c) &&
  c.mechanism === 'cpmm-multi-2' &&
  c.outcomeType === 'MULTIPLE_CHOICE' &&
  c.shouldAnswersSumToOne === true

// SQL uses the same timezone-qualified sports timestamp format.
export const SPORTS_KICKOFF_TIMESTAMP_PATTERN =
  '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?(Z|[+-](0[0-9]|1[0-4]):[0-5][0-9])$'
const kickoffPattern = new RegExp(SPORTS_KICKOFF_TIMESTAMP_PATTERN)
export function parseSportsKickoffMs(value?: string) {
  if (!value || !kickoffPattern.test(value)) return NaN
  const date = value.slice(0, 10)
  const midnight = Date.parse(date + 'T00:00:00Z')
  // Date.parse normalizes some impossible dates (e.g. February 30).
  if (
    !Number.isFinite(midnight) ||
    new Date(midnight).toISOString().slice(0, 10) !== date
  )
    return NaN
  return Date.parse(value)
}

/** Structural eligibility only. The withdrawal integration owns its own switch and execution. */
export function isKickoffLiquidityCandidate(contract: Contract) {
  if (!isLinkedCpmmMulti2(contract)) return false
  const sports: Partial<Sports> = contract as Contract & Partial<Sports>
  const provider = providerOf(sports)
  const legacyOddsTime =
    sports.sportsProvider == null &&
    sports.sportsStartKnown == null &&
    sports.sportsEventId?.startsWith('odds:')
  return (
    ['bdl', 'odds', 'football-data'].includes(provider) &&
    contract.token === 'MANA' &&
    MANIFOLD_SPORTS_USER_IDS.includes(contract.creatorId) &&
    !contract.deleted &&
    !contract.isResolved &&
    contract.resolution == null &&
    contract.addAnswersMode === 'DISABLED' &&
    sports.sportsMarketType === 'moneyline' &&
    !sports.sportsFixture &&
    !sports.sportsEventId?.startsWith('fixture:') &&
    (sports.sportsStartKnown === true || legacyOddsTime === true) &&
    Number.isFinite(contract.closeTime) &&
    (contract.closeTime ?? 0) >
      parseSportsKickoffMs(sports.sportsStartTimestamp) &&
    (contract.answers.length === 2 || contract.answers.length === 3) &&
    contract.answers.every((a) => {
      const label = a.text?.trim().toLowerCase()
      return !a.isOther && !!label && label !== 'other' && a.resolution == null
    })
  )
}

/** The price selector has already screened staleness, placeholders and malformed books. */
export function isGoodOpeningLine(line: SportsOpeningLine) {
  return (
    (line.source === 'polymarket' ||
      line.source === 'kalshi' ||
      (line.source === 'books' &&
        Number.isSafeInteger(line.bookCount) &&
        line.bookCount > 0)) &&
    (line.probs.length === 2 || line.probs.length === 3) &&
    line.probs.every((p) => Number.isFinite(p) && p > 0 && p < 1) &&
    Math.abs(line.probs.reduce((sum, p) => sum + p, 0) - 1) < 1e-8
  )
}

export function chooseSportsGameAnte(input: {
  line: SportsOpeningLine
  mode: SportsKickoffMode
  startKnown: boolean
  baseAnte?: number
  enabled?: boolean
}): SportsAnteDecision {
  const ante = input.baseAnte ?? SPORTS_GAME_BASE_ANTE
  if (!Number.isFinite(ante) || ante <= 0)
    throw new Error('Invalid starting liquidity')
  if (
    !(input.enabled ?? SPORTS_KICKOFF_FUNDING_ENABLED) ||
    input.mode !== 'live'
  )
    return { ante, reason: 'kickoff funding off' }
  if (!input.startKnown) return { ante, reason: 'start time unknown' }
  if (!isGoodOpeningLine(input.line))
    return { ante, reason: 'no eligible opening line' }
  if (ante >= SPORTS_KICKOFF_BUDGET)
    return { ante, reason: 'base ante covers kickoff budget' }
  return {
    ante: SPORTS_KICKOFF_BUDGET,
    kickoffBudget: SPORTS_KICKOFF_BUDGET,
    reason: 'kickoff funded',
  }
}
