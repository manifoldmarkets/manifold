import { answerP, type Answer } from '../answer'
import { getCpmmProbability } from '../calculate-cpmm'
import { isMultiCpmmMechanism, MAX_CPMM_PROB, type Sports } from '../contract'
import { officialBdlLeagueKey } from '../sports-league-label'
import { parseBdlEventId } from '../sports-ids'
import { LIVE_STALE_MS } from '../sports-schedule'
import type { TennisMatch } from './tennis'

// The native versus ticket calls the first fetched answer YES, independently of its index.
// Persisted sportsEntrantIds are by answer index. Player display order can change with rankings.
export type TennisMarketSource = Pick<
  Sports,
  | 'sportsEventId'
  | 'sportsLeagueKey'
  | 'sportsProvider'
  | 'sportsFixture'
  | 'sportsMarketType'
  | 'sportsEntrantIds'
  | 'sportsAttentionReason'
> & {
  id: string
  creatorId: string
  visibility: string
  mechanism: string
  token: string
  outcomeType: string
  shouldAnswersSumToOne: boolean
  addAnswersMode: string
  closeTime?: number
  deleted?: boolean
  isResolved: boolean
  resolution?: string
  answers: readonly Pick<
    Answer,
    | 'id'
    | 'contractId'
    | 'index'
    | 'text'
    | 'poolYes'
    | 'poolNo'
    | 'p'
    | 'isOther'
    | 'resolutionTime'
    | 'resolution'
  >[]
}
export type TennisPick = {
  contractId: string
  eventId: string
  entrantId: number
  answerId: string
  name: string
  probability: number
  nativeSide: 'YES' | 'NO'
  buyable: boolean
}
const normalized = (value: string) =>
  value.trim().replace(/\s+/gu, ' ').toLowerCase()
export function tennisPicks(
  match: TennisMatch,
  market: TennisMarketSource | undefined,
  readStartedAt: number | null | undefined,
  now: number
): TennisPick[] {
  if (
    !market ||
    !match.eligibleRound ||
    match.attention ||
    (match.status !== 'scheduled' && match.status !== 'live') ||
    readStartedAt == null ||
    !Number.isSafeInteger(readStartedAt) ||
    readStartedAt < 0 ||
    !Number.isFinite(now) ||
    readStartedAt > now ||
    now - readStartedAt >= LIVE_STALE_MS ||
    officialBdlLeagueKey(market) !== match.tour ||
    market.sportsEventId !== match.eventId ||
    market.sportsProvider !== 'bdl' ||
    market.sportsMarketType !== 'moneyline' ||
    market.visibility !== 'public' ||
    market.token !== 'MANA' ||
    market.deleted ||
    market.isResolved ||
    market.resolution ||
    market.sportsAttentionReason ||
    !Number.isFinite(market.closeTime) ||
    market.closeTime! <= now ||
    !isMultiCpmmMechanism(market.mechanism) ||
    market.outcomeType !== 'MULTIPLE_CHOICE' ||
    !market.shouldAnswersSumToOne ||
    market.addAnswersMode !== 'DISABLED' ||
    market.answers.length !== 2 ||
    market.sportsEntrantIds?.length !== 2
  )
    return []
  const parsed = parseBdlEventId(match.eventId),
    ids = market.sportsEntrantIds
  if (
    !parsed ||
    !('entrantIds' in parsed) ||
    parsed.id !== match.id ||
    !parsed.entrantIds.every((id) => ids.includes(id))
  )
    return []
  const [main, other] = market.answers
  const price = (a: typeof main) => {
    const p = answerP(a)
    return Number.isFinite(a.poolYes) &&
      a.poolYes > 0 &&
      Number.isFinite(a.poolNo) &&
      a.poolNo > 0 &&
      Number.isFinite(p) &&
      p > 0 &&
      p < 1
      ? getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, p)
      : NaN
  }
  const yes = price(main),
    otherPrice = price(other)
  if (
    !main.id ||
    !other.id ||
    main.id === other.id ||
    main.index === other.index ||
    !Number.isFinite(yes) ||
    !Number.isFinite(otherPrice) ||
    Math.abs(yes + otherPrice - 1) > 0.000001
  )
    return []
  const picks: TennisPick[] = []
  for (const side of match.sides) {
    const a = market.answers.find(
      (a) => Number.isInteger(a.index) && ids[a.index] === side.id
    )
    if (
      !a ||
      a.contractId !== market.id ||
      a.isOther ||
      a.resolution ||
      a.resolutionTime ||
      normalized(a.text) !== normalized(side.name)
    )
      return []
    const probability = a === main ? yes : 1 - yes
    picks.push({
      contractId: market.id,
      eventId: match.eventId,
      entrantId: side.id,
      answerId: a.id,
      name: a.text,
      probability,
      nativeSide: a === main ? 'YES' : 'NO',
      buyable: probability < MAX_CPMM_PROB,
    })
  }
  return picks
}
export function sameTennisPick(a: TennisPick, b: TennisPick) {
  return (
    a.contractId === b.contractId &&
    a.eventId === b.eventId &&
    a.entrantId === b.entrantId &&
    a.answerId === b.answerId &&
    a.nativeSide === b.nativeSide
  )
}
