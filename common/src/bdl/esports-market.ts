import { type Answer, answerP } from '../answer'
import { getCpmmProbability } from '../calculate-cpmm'
import { isMultiCpmmMechanism, MAX_CPMM_PROB, type Sports } from '../contract'
import { officialBdlLeagueKey } from '../sports-league-label'
import { bdlEventId } from '../sports-ids'
import { LIVE_STALE_MS } from '../sports-schedule'
import { esportsTournamentScope, type EsportsSeries } from './esports-series'

type MarketAnswer = Pick<
  Answer,
  | 'id'
  | 'contractId'
  | 'index'
  | 'text'
  | 'poolYes'
  | 'poolNo'
  | 'p'
  | 'isOther'
  | 'resolution'
  | 'resolutionTime'
>
export type EsportsMarket = Pick<
  Sports,
  | 'sportsLeagueKey'
  | 'sportsProvider'
  | 'sportsEventId'
  | 'sportsFixture'
  | 'sportsMarketType'
  | 'sportsEntrantIds'
  | 'sportsAttentionReason'
> & {
  id: string
  creatorId: string
  visibility: string
  token: string
  mechanism: string
  outcomeType: string
  addAnswersMode: string
  shouldAnswersSumToOne: boolean
  deleted?: boolean
  isResolved: boolean
  resolution?: string
  closeTime?: number
  answers: readonly MarketAnswer[]
}
export type EsportsSeriesView = {
  series: EsportsSeries
  observedAt: number | null
  market?: EsportsMarket
  marketReadAt?: number
}
export type EsportsScope = Parameters<typeof esportsTournamentScope>[1]
export type EsportsPick = {
  contractId: string
  eventId: string
  entrantId: number
  answerId: string
  nativeSide: 'YES' | 'NO'
  name: string
  probability: number
  buyable: boolean
}
export function freshEsportsRead(at: number | null | undefined, now: number) {
  return (
    at != null &&
    Number.isSafeInteger(at) &&
    at >= 0 &&
    Number.isSafeInteger(now) &&
    now >= at &&
    now - at < LIVE_STALE_MS
  )
}
function probability(answer: MarketAnswer) {
  const { poolYes, poolNo } = answer,
    p = answerP(answer)
  if (
    ![poolYes, poolNo, p].every(Number.isFinite) ||
    poolYes <= 0 ||
    poolNo <= 0 ||
    p <= 0 ||
    p >= 1
  )
    return NaN
  return getCpmmProbability({ YES: poolYes, NO: poolNo }, p)
}
const key = (s: string) =>
  s.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
export function esportsPicks(
  view: EsportsSeriesView,
  now: number,
  scope?: EsportsScope
): EsportsPick[] {
  const { series: s, market: m } = view
  if (
    !s.team1 ||
    !s.team2 ||
    s.team1.id === s.team2.id ||
    key(s.team1.name) === key(s.team2.name) ||
    s.review ||
    s.skipBestOfTwo ||
    !s.bestOf ||
    ![1, 3, 5].includes(s.bestOf) ||
    (s.status !== 'in_progress' && s.status !== 'scheduled') ||
    esportsTournamentScope(s, scope) !== 'in-scope' ||
    !freshEsportsRead(view.observedAt, now) ||
    !freshEsportsRead(view.marketReadAt, now) ||
    !m ||
    !m.id ||
    !Number.isSafeInteger(s.id) ||
    s.id <= 0 ||
    s.eventId !== bdlEventId(s.league, s.id) ||
    m.sportsProvider !== 'bdl' ||
    m.sportsLeagueKey !== s.league ||
    officialBdlLeagueKey(m) !== s.league ||
    m.sportsEventId !== s.eventId ||
    m.sportsMarketType !== 'moneyline' ||
    m.visibility !== 'public' ||
    m.token !== 'MANA' ||
    m.deleted ||
    m.isResolved ||
    m.resolution ||
    m.sportsAttentionReason ||
    !Number.isSafeInteger(m.closeTime) ||
    m.closeTime! <= now ||
    !isMultiCpmmMechanism(m.mechanism) ||
    m.outcomeType !== 'MULTIPLE_CHOICE' ||
    m.addAnswersMode !== 'DISABLED' ||
    !m.shouldAnswersSumToOne ||
    !Array.isArray(m.answers) ||
    m.answers.length !== 2 ||
    m.sportsEntrantIds?.length !== 2
  )
    return []
  const [main, other] = m.answers,
    ids = m.sportsEntrantIds
  const first = probability(main),
    second = probability(other)
  if (
    ![first, second].every((p) => Number.isFinite(p) && p >= 0 && p <= 1) ||
    Math.abs(first + second - 1) > 1e-6 ||
    !main.id ||
    !other.id ||
    main.id === other.id ||
    main.index === other.index
  )
    return []
  const picks: EsportsPick[] = []
  for (const team of [s.team1, s.team2]) {
    const answer = m.answers.find(
      (a) => (a.index === 0 || a.index === 1) && ids[a.index] === team.id
    )
    if (
      !answer ||
      answer.contractId !== m.id ||
      answer.isOther ||
      answer.resolution ||
      answer.resolutionTime != null ||
      typeof answer.text !== 'string' ||
      key(answer.text) !== key(team.name)
    )
      return []
    const isMain = answer === main,
      p = isMain ? first : 1 - first
    picks.push({
      contractId: m.id,
      eventId: s.eventId,
      entrantId: team.id,
      answerId: answer.id,
      nativeSide: isMain ? 'YES' : 'NO',
      name: answer.text,
      probability: p,
      buyable: p < MAX_CPMM_PROB,
    })
  }
  return picks
}
export const sameEsportsPick = (a: EsportsPick, b: EsportsPick) =>
  a.contractId === b.contractId &&
  a.eventId === b.eventId &&
  a.entrantId === b.entrantId &&
  a.answerId === b.answerId &&
  a.nativeSide === b.nativeSide
