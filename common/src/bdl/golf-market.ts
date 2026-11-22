import { answerP, type Answer } from '../answer'
import { getCpmmProbability } from '../calculate-cpmm'
import { isMultiCpmmMechanism, MAX_CPMM_PROB, type Sports } from '../contract'
import { officialBdlLeagueKey } from '../sports-league-label'
import { LIVE_STALE_MS } from '../sports-schedule'
import { BDL_FIELD_PRICED_RUNNER_CAP } from './constants'
import {
  isOfficialGolfTournament,
  type GolfField,
  type GolfPlayer,
} from './golf'
import { bdlEventId } from '../sports-ids'

type GolfAnswer = Pick<
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
export type GolfMarket = Pick<
  Sports,
  | 'sportsProvider'
  | 'sportsFixture'
  | 'sportsLeagueKey'
  | 'sportsEventId'
  | 'sportsEntrantIds'
  | 'sportsAttentionReason'
> & {
  id: string
  creatorId: string
  visibility: string
  token: string
  mechanism: string
  outcomeType: string
  sportsMarketType?: string
  topN?: number
  shouldAnswersSumToOne: boolean
  isResolved: boolean
  resolution?: string
  deleted?: boolean
  closeTime?: number
  answers: readonly GolfAnswer[]
}
export type GolfPick = {
  contractId: string
  eventId: string
  playerId: number | null
  answerId: string
  name: string
  probability: number
  buyable: boolean
  kind: 'winner' | 'top_n'
  excludedPlayerIds?: readonly number[]
}
export const golfMarketLabel = (kind: GolfPick['kind']) =>
  kind === 'winner' ? 'Tournament winner' : 'Finish in the top 10'
/** Rebind the displayed contract, outcome and player before passing a pick on. */
export function currentGolfPick(
  field: GolfField,
  market: GolfMarket,
  selected: GolfPick,
  now: number
) {
  return golfMarketView(field, market, now)?.picks.find(
    (pick) =>
      pick.buyable &&
      pick.contractId === selected.contractId &&
      pick.eventId === selected.eventId &&
      pick.answerId === selected.answerId &&
      pick.playerId === selected.playerId &&
      pick.kind === selected.kind &&
      (pick.playerId !== null ||
        (pick.excludedPlayerIds !== undefined &&
          selected.excludedPlayerIds?.length ===
            pick.excludedPlayerIds.length &&
          pick.excludedPlayerIds.every(
            (id, index) => id === selected.excludedPlayerIds?.[index]
          ))) &&
      pick.name === selected.name &&
      pick.probability === selected.probability
  )
}
const normalize = (s: string) =>
  s.trim().replace(/\s+/gu, ' ').normalize('NFC').toLowerCase()
export function golfMarketView(field: GolfField, m: GolfMarket, now: number) {
  const t = field.tournament,
    winner = m.sportsMarketType === 'winner'
  if (
    !m.id ||
    !Number.isSafeInteger(t.id) ||
    t.id <= 0 ||
    t.eventId !== bdlEventId(t.tour, t.id) ||
    officialBdlLeagueKey(m) !== t.tour ||
    m.sportsProvider !== 'bdl' ||
    m.sportsEventId !== t.eventId ||
    m.visibility !== 'public' ||
    m.token !== 'MANA' ||
    m.deleted ||
    !isMultiCpmmMechanism(m.mechanism) ||
    m.outcomeType !== 'MULTIPLE_CHOICE' ||
    (!winner && (m.sportsMarketType !== 'top_n' || m.topN !== 10)) ||
    m.shouldAnswersSumToOne !== winner
  )
    return null
  const entrants = m.sportsEntrantIds
  if (
    !entrants ||
    entrants.length !== m.answers.length ||
    m.answers.length < 2 ||
    m.answers.length > BDL_FIELD_PRICED_RUNNER_CAP + (winner ? 1 : 0) ||
    m.answers.filter((a) => a.isOther).length !== (winner ? 1 : 0)
  )
    return null
  const kind = winner ? ('winner' as const) : ('top_n' as const)
  const fresh =
    Number.isFinite(now) &&
    Number.isSafeInteger(field.readStartedAt) &&
    field.readStartedAt >= 0 &&
    field.readStartedAt <= now &&
    now - field.readStartedAt < LIVE_STALE_MS
  const open =
    isOfficialGolfTournament(t) &&
    fresh &&
    !field.incomplete &&
    !m.sportsAttentionReason &&
    !m.isResolved &&
    !m.resolution &&
    Number.isFinite(m.closeTime) &&
    m.closeTime! > now &&
    (t.state === 'scheduled' || t.state === 'live')
  const picks: GolfPick[] = [],
    indices = new Set<number>(),
    ids = new Set<string>(),
    mapped = new Set<number>()
  const players = new Map<number, GolfPlayer>(),
    names = new Set<string>()
  for (const player of field.players) {
    if (players.has(player.playerId)) return null
    players.set(player.playerId, player)
  }
  for (const a of m.answers) {
    if (
      !a.id ||
      ids.has(a.id) ||
      a.contractId !== m.id ||
      !Number.isInteger(a.index) ||
      a.index < 0 ||
      a.index >= entrants.length ||
      indices.has(a.index)
    )
      return null
    const entrant = entrants[a.index],
      p = answerP(a),
      player = entrant != null ? players.get(entrant) : undefined
    const name = normalize(a.text)
    if (!name || names.has(name)) return null
    if (
      a.isOther
        ? entrant !== null || name !== 'other'
        : !player ||
          mapped.has(player.playerId) ||
          normalize(player.name) !== name
    )
      return null
    if (
      !Number.isFinite(a.poolYes) ||
      a.poolYes <= 0 ||
      !Number.isFinite(a.poolNo) ||
      a.poolNo <= 0 ||
      !Number.isFinite(p) ||
      p <= 0 ||
      p >= 1
    )
      return null
    const prob = getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, p)
    if (!Number.isFinite(prob) || prob <= 0 || prob >= 1) return null
    const inactive =
      player &&
      (player.state === 'withdrawn' ||
        player.state === 'disqualified' ||
        player.state === 'cut' ||
        player.state === 'unknown' ||
        (t.state === 'live' && player.state !== 'active') ||
        player.fieldPresent === false)
    picks.push({
      contractId: m.id,
      kind,
      ...(a.isOther
        ? {
            excludedPlayerIds: entrants
              .filter((id): id is number => id !== null)
              .sort((a, b) => a - b),
          }
        : {}),
      eventId: t.eventId,
      playerId: entrant,
      answerId: a.id,
      name: a.text,
      probability: prob,
      buyable:
        open &&
        !inactive &&
        !a.resolution &&
        !a.resolutionTime &&
        prob < MAX_CPMM_PROB,
    })
    ids.add(a.id)
    indices.add(a.index)
    names.add(name)
    if (player) mapped.add(player.playerId)
  }
  if (
    winner &&
    Math.abs(picks.reduce((sum, p) => sum + p.probability, 0) - 1) > 0.000001
  )
    return null
  return {
    kind,
    picks: picks.sort(
      (a, b) =>
        Number(a.playerId === null) - Number(b.playerId === null) ||
        b.probability - a.probability ||
        a.name.localeCompare(b.name)
    ),
  }
}
