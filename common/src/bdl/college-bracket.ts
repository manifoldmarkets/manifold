import { bdlEventId } from '../sports-ids'
import { normalizeBdlStatus, type ProviderGameStatus } from '../sports-provider'
import {
  collegeId,
  collegeObject,
  collegeScore,
  collegeTeam,
  collegeText,
  collegeTime,
  type CollegeBasketballLeague,
  type CollegeGame,
  type CollegeTeam,
} from './college-games'

const roundLabels = [
  'First Four',
  'Round of 64',
  'Round of 32',
  'Sweet 16',
  'Elite Eight',
  'Final Four',
  'Championship',
] as const
const roundSizes = [4, 32, 16, 8, 4, 2, 1] as const
type Side = {
  team: CollegeTeam | null
  seed: number | null
  score: number | null
}
export type CollegeBracketSlot = {
  slotKey: string
  round: number
  position: number
  sourcePresent: boolean
  eventId: string | null
  startTime: string | null
  region: string | null
  status: ProviderGameStatus
  home: Side
  away: Side
  winnerId: number | null
  advancesTo: string | null
}
export type CollegeBracket = {
  league: CollegeBasketballLeague
  season: number
  rounds: { label: string; slots: CollegeBracketSlot[] }[]
  issues: string[]
}
const side = (raw: unknown, scored: boolean): Side => {
  const v = collegeObject(raw),
    seed = collegeId(v.seed)
  return {
    team: collegeTeam(v),
    seed: seed !== null && seed <= 16 ? seed : null,
    score: scored ? collegeScore(v.score) : null,
  }
}
function emptySlot(
  league: CollegeBasketballLeague,
  season: number,
  round: number,
  position: number
): CollegeBracketSlot {
  return {
    slotKey:
      'bdl:' + league + '-bracket:' + season + ':' + round + ':' + position,
    round,
    position,
    sourcePresent: false,
    eventId: null,
    startTime: null,
    region: null,
    status: 'unknown',
    home: side(null, false),
    away: side(null, false),
    winnerId: null,
    advancesTo: null,
  }
}
export const collegeTournamentSeason = (springYear: number) => {
  if (
    !Number.isSafeInteger(springYear) ||
    springYear < 1001 ||
    springYear > 9999
  )
    throw new Error('Invalid tournament year')
  return springYear - 1
}
/** Confirm an ordinary league/season-scoped game against the independent bracket observation. */
export function matchesCollegeBracketSlot(
  game: CollegeGame,
  slot: CollegeBracketSlot
) {
  return (
    !!slot.startTime &&
    game.startTime === slot.startTime &&
    !!slot.home.team &&
    !!slot.away.team &&
    slot.home.team.id !== slot.away.team.id &&
    game.home?.id === slot.home.team.id &&
    game.away?.id === slot.away.team.id &&
    slot.status !== 'unknown' &&
    game.status === slot.status &&
    (slot.status !== 'final' ||
      (slot.winnerId !== null &&
        game.homeScore === slot.home.score &&
        game.awayScore === slot.away.score))
  )
}
/** A provisional bracket slot and a separately verified ordinary game have different identities. */
export function projectCollegeBracket(
  league: CollegeBasketballLeague,
  season: number,
  rows: readonly unknown[],
  games: readonly CollegeGame[] = [],
  declaredBase?: 0 | 1
): CollegeBracket {
  const result: CollegeBracket = { league, season, rounds: [], issues: [] }
  if (!Number.isSafeInteger(season) || season < 1000 || season > 9999)
    throw new Error('Invalid college bracket season')
  if (!rows.length) return result
  const records = rows.map(collegeObject)
  if (records.some((v) => v.season !== season)) {
    result.issues.push('Bracket season mismatch')
    return result
  }
  const zero = records.some((v) => v.round === 0),
    seven = records.some((v) => v.round === 7)
  const base = declaredBase ?? (zero ? 0 : seven ? 1 : null)
  if (base === null || (zero && base !== 0) || (seven && base !== 1)) {
    result.issues.push('Unverified round numbering')
    return result
  }
  if (
    records.some(
      (v) =>
        typeof v.round !== 'number' ||
        !Number.isInteger(v.round) ||
        v.round < base ||
        v.round > base + 6
    )
  ) {
    result.issues.push('Unsupported tournament format')
    return result
  }

  if (
    records.some((v) => {
      const position = collegeId(v.bracket_location),
        round = (v.round as number) - base
      return position !== null && position > roundSizes[round]
    })
  ) {
    result.issues.push('Unsupported tournament format')
    return result
  }

  const seenSlots = new Set<string>(),
    ambiguousSlots = new Set<string>(),
    seenGames = new Map<number, string>(),
    ambiguousGames = new Set<number>()
  const ordinary = new Map<number, CollegeGame>()
  for (const game of games) {
    if (game.league !== league || game.season !== season) continue
    if (
      ordinary.has(game.gameId) &&
      JSON.stringify(ordinary.get(game.gameId)) !== JSON.stringify(game)
    )
      ambiguousGames.add(game.gameId)
    ordinary.set(game.gameId, game)
  }
  result.rounds = roundLabels.map((label, round) => ({
    label,
    slots: Array.from({ length: roundSizes[round] }, (_, i) =>
      emptySlot(league, season, round, i + 1)
    ),
  }))
  for (const v of records) {
    const round = (v.round as number) - base,
      position = collegeId(v.bracket_location)
    if (position === null) {
      result.issues.push('Unplaced bracket row in ' + roundLabels[round])
      continue
    }
    const slot = result.rounds[round].slots[position - 1]
    const id = collegeId(v.game_id)
    if (id !== null) {
      if (seenGames.has(id) && seenGames.get(id) !== slot.slotKey)
        ambiguousGames.add(id)
      seenGames.set(id, slot.slotKey)
    }
    if (seenSlots.has(slot.slotKey)) {
      ambiguousSlots.add(slot.slotKey)
      continue
    }
    seenSlots.add(slot.slotKey)
    const status = normalizeBdlStatus(v.status_state)
    const scored =
      status === 'final' || status === 'in_progress' || status === 'suspended'
    const home = side(v.home_team, scored),
      away = side(v.away_team, scored),
      time = collegeTime(v.date)
    Object.assign(slot, {
      sourcePresent: true,
      status,
      home,
      away,
      startTime: time,
      region: collegeText(v.region_label),
    })
    if (home.team && away.team && home.team.id === away.team.id) {
      slot.home = side(null, false)
      slot.away = side(null, false)
      result.issues.push('Repeated participant in ' + slot.slotKey)
    }
    if (!home.team || !away.team || home.team.id === away.team.id) continue
    const homeFlag = collegeObject(v.home_team).winner,
      awayFlag = collegeObject(v.away_team).winner
    const homeWon = homeFlag === true,
      awayWon = awayFlag === true
    const loserFlag = homeWon ? awayFlag : homeFlag
    if (
      status === 'final' &&
      (loserFlag === null || loserFlag === false) &&
      homeWon !== awayWon &&
      home.score !== null &&
      away.score !== null &&
      (homeWon ? home.score > away.score : away.score > home.score)
    ) {
      slot.winnerId = homeWon ? home.team.id : away.team.id
    } else if (status === 'final')
      result.issues.push('Unverified winner for ' + slot.slotKey)
    if (!id) continue
    const game = ordinary.get(id)
    // Do not promote a similarly numbered bracket ID or expose an unverified market link.
    if (game && matchesCollegeBracketSlot(game, slot))
      slot.eventId = bdlEventId(league, id)
  }
  for (const { slots } of result.rounds)
    for (const slot of slots) {
      if (ambiguousSlots.has(slot.slotKey)) {
        Object.assign(
          slot,
          emptySlot(league, season, slot.round, slot.position)
        )
        result.issues.push('Conflicting bracket slot ' + slot.slotKey)
      }
    }
  for (const id of ambiguousGames) {
    for (const { slots } of result.rounds)
      for (const slot of slots)
        if (slot.eventId === bdlEventId(league, id)) slot.eventId = null
    result.issues.push('Conflicting ordinary game ID ' + id)
  }
  for (let round = 0; round < result.rounds.length - 1; round++) {
    const next = result.rounds[round + 1].slots
    for (const slot of result.rounds[round].slots) {
      if (!slot.winnerId) continue
      // First Four slots have no reliable geometric destination. Even in later rounds,
      // require the advancing entrant in the independently supplied destination.
      const matches = next.filter(
        (s) =>
          s.home.team?.id === slot.winnerId || s.away.team?.id === slot.winnerId
      )
      if (
        matches.length === 1 &&
        (round === 0 || matches[0].position === Math.ceil(slot.position / 2))
      )
        slot.advancesTo = matches[0].slotKey
    }
  }
  return result
}
