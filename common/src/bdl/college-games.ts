import { bdlEventId } from '../sports-ids'
import { parseSportsKickoffMs } from '../sports-kickoff-interface'
import { normalizeBdlStatus, type ProviderGameStatus } from '../sports-provider'
import { normalizeTeam } from '../sports-team-colors'

export type CollegeLeague = 'ncaaf' | 'ncaab' | 'ncaaw' | 'cbb'
export type CollegeBasketballLeague = 'ncaab' | 'ncaaw'
export type CollegeTeam = {
  id: number
  name: string
  abbreviation: string | null
  conferenceId: string | null
}
export type CollegeGame = {
  league: CollegeLeague
  eventId: string
  gameId: number
  season: number
  week: number | null
  startTime: string | null
  slateDate: string | null
  status: ProviderGameStatus
  home: CollegeTeam | null
  away: CollegeTeam | null
  unnamedTeamIds?: number[]
  homeScore: number | null
  awayScore: number | null
  postseason: boolean | null
}

export const collegeObject = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
export const collegeText = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : null
export function collegeId(v: unknown) {
  const n = typeof v === 'string' && /^[1-9][0-9]*$/.test(v) ? Number(v) : v
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null
}
export const collegeScore = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null
export function collegeTime(v: unknown) {
  if (typeof v !== 'string') return null
  const stamp = v
    .toUpperCase()
    .replace(/(T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/, '$1:00$2')
    .replace(/(\.\d{3})\d+(?=Z$|[+-]\d{2}:\d{2}$)/, '$1')
  const ms = parseSportsKickoffMs(stamp)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
export function collegeDay(v: unknown) {
  return typeof v === 'string' &&
    /^\d{4}-\d\d-\d\d$/.test(v) &&
    collegeTime(v + 'T00:00:00Z')
    ? v
    : null
}
const easternDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function collegeTeam(raw: unknown): CollegeTeam | null {
  const v = collegeObject(raw),
    id = collegeId(v.id),
    name = collegeText(v.full_name)
  if (
    !id ||
    !name ||
    /^(?:tbd|tba|to be (?:announced|determined))$/i.test(name)
  )
    return null
  const conference = v.conference_id ?? v.conference
  return {
    id,
    name,
    abbreviation: collegeText(v.abbreviation),
    conferenceId:
      collegeText(conference) ??
      (collegeId(conference) ? String(conference) : null),
  }
}
export function collegeGame(league: CollegeLeague, raw: unknown): CollegeGame {
  const v = collegeObject(raw),
    gameId = collegeId(v.id),
    season = collegeId(v.season)
  if (!gameId || !season || season < 1000 || season > 9999)
    throw new Error('Invalid college game ID or season')
  const startTime = collegeTime(v.date),
    home = collegeTeam(v.home_team),
    away = collegeTeam(v.visitor_team)
  if (home && home.id === away?.id) throw new Error('Duplicate college team ID')
  const unnamedTeamIds = [
    home ? null : collegeId(collegeObject(v.home_team).id),
    away ? null : collegeId(collegeObject(v.visitor_team).id),
  ].filter((id): id is number => id !== null)
  const status = normalizeBdlStatus(v.status_state)
  // Providers can send two numeric zeroes before play. They are not observed scores.
  const hasScore =
    status === 'final' || status === 'in_progress' || status === 'suspended'
  return {
    league,
    eventId: bdlEventId(league, gameId),
    gameId,
    season,
    week: collegeId(v.week),
    startTime,
    slateDate: startTime
      ? easternDay.format(new Date(startTime))
      : collegeDay(v.date),
    status,
    home,
    away,
    ...(unnamedTeamIds.length ? { unnamedTeamIds } : {}),
    homeScore: hasScore ? collegeScore(v.home_score) : null,
    awayScore: hasScore ? collegeScore(v.away_score) : null,
    postseason: typeof v.postseason === 'boolean' ? v.postseason : null,
  }
}

/** Compare only within the supplied league's existing market names. A provider ID is never guessed from a nickname. */
export function matchCollegeTeams(
  teams: readonly CollegeTeam[],
  existingNames: readonly string[],
  knownNames: ReadonlyMap<number, string> = new Map()
) {
  const names = new Map<string, Set<string>>()
  for (const name of existingNames) {
    const key = normalizeTeam(name)
    if (!key) continue
    const matches = names.get(key) ?? new Set<string>()
    matches.add(name)
    names.set(key, matches)
  }
  const reserved = new Map<string, Set<number>>()
  const observations = new Map<number, Set<string>>()
  const claims = new Map<string, Set<number>>()
  function claim(owners: Map<string, Set<number>>, label: string, id: number) {
    const key = normalizeTeam(label)
    const ids = owners.get(key) ?? new Set<number>()
    ids.add(id)
    owners.set(key, ids)
  }
  for (const [id, name] of knownNames) claim(reserved, name, id)
  for (const { id, name } of teams) {
    const observed = observations.get(id) ?? new Set<string>()
    observed.add(name)
    observations.set(id, observed)
    if (!knownNames.has(id)) claim(claims, name, id)
  }
  const mapped = new Map<number, string>(),
    unmatched = new Map<number, string>()
  for (const id of [...observations.keys()].sort((a, b) => a - b)) {
    const observed = [...observations.get(id)!].sort()
    const explicit = knownNames.get(id)
    const keys = new Set(observed.map(normalizeTeam))
    const key = normalizeTeam(explicit ?? observed[0])
    const candidates = names.get(key)
    const canonical =
      explicit !== undefined
        ? existingNames.includes(explicit) && reserved.get(key)?.size === 1
          ? explicit
          : null
        : keys.size === 1 &&
          candidates?.size === 1 &&
          !reserved.has(key) &&
          claims.get(key)?.size === 1
        ? [...candidates][0]
        : null
    if (canonical) mapped.set(id, canonical)
    else unmatched.set(id, observed.join(' / '))
  }
  return { mapped, unmatched }
}

export function collegeApRank(
  ranks: ReadonlyMap<number, number> | undefined,
  id: number
) {
  const rank = ranks?.get(id)
  return typeof rank === 'number' &&
    Number.isInteger(rank) &&
    rank >= 1 &&
    rank <= 25
    ? rank
    : null
}
export type CollegeApPoll = {
  league: CollegeLeague
  season: number
  week: number
  ranks: ReadonlyMap<number, number>
}
export function collegeApRanks(
  league: CollegeLeague,
  season: number,
  week: number,
  rows: readonly unknown[]
) {
  const ranks = new Map<number, number>()
  for (const raw of rows) {
    const v = collegeObject(raw),
      team = collegeId(collegeObject(v.team).id),
      rank = collegeId(v.rank)
    const poll = collegeText(v.poll) ?? collegeText(v.poll_id)
    // The football endpoint is AP-only and its recorded rows have no poll discriminator.
    if (
      league === 'cbb' ||
      v.season !== season ||
      v.week !== week ||
      !team ||
      !rank ||
      !(poll?.toLowerCase() === 'ap' || (league === 'ncaaf' && poll === null))
    )
      continue
    if (ranks.has(team) && ranks.get(team) !== rank)
      throw new Error('Conflicting AP ranking for college team')
    ranks.set(team, rank)
  }
  for (const [team, rank] of ranks) if (rank > 25) ranks.delete(team)
  return { league, season, week, ranks } satisfies CollegeApPoll
}

export type CollegeScheduleWindow = {
  league: CollegeLeague
  season: number
  regularSeasonStart: string | null
  /** Verified calendar boundaries; missing or conflicting boundaries leave the game out. */
  regularSeasonEnd: string | null
  tournamentStartByConference: ReadonlyMap<string, string>
  playoffGameIds: ReadonlySet<number>
  poll: CollegeApPoll | null
  /** Basketball game rows do not carry a poll week. Require a verified effective interval for the selected issue. */
  pollEffectiveDates?: { from: string; to: string }
}
/** Sporting scope only. Funding requires its separate approved gates and an opening price. */
export function collegeGameScope(
  game: CollegeGame,
  policy: CollegeScheduleWindow,
  verifiedBracketIds: ReadonlySet<string> = new Set()
) {
  if (
    game.league !== policy.league ||
    game.season !== policy.season ||
    !game.home ||
    !game.away ||
    !game.slateDate ||
    game.league === 'cbb'
  )
    return null
  if (game.league === 'ncaaf') {
    // The 2026 season, including its bowls and CFP in January 2027, stays on the existing provider.
    if (game.season < 2027) return null
    if (policy.playoffGameIds.has(game.gameId))
      return 'listed-football-postseason'
  }
  if (game.league !== 'ncaaf' && verifiedBracketIds.has(game.eventId))
    return 'march-madness'
  const start = collegeDay(policy.regularSeasonStart),
    end = collegeDay(policy.regularSeasonEnd)
  if (
    !start ||
    !end ||
    game.slateDate < start ||
    game.slateDate > end ||
    game.postseason === true
  )
    return null
  if (game.league !== 'ncaaf') {
    for (const team of [game.home, game.away]) {
      const start =
        team.conferenceId &&
        collegeDay(policy.tournamentStartByConference.get(team.conferenceId))
      if (!start || game.slateDate >= start) return null
    }
  }
  const poll = policy.poll
  if (
    !poll ||
    poll.league !== game.league ||
    poll.season !== game.season ||
    (game.league === 'ncaaf' && poll.week !== game.week)
  )
    return null
  if (game.league !== 'ncaaf') {
    const from = collegeDay(policy.pollEffectiveDates?.from),
      to = collegeDay(policy.pollEffectiveDates?.to)
    if (!from || !to || game.slateDate < from || game.slateDate > to)
      return null
  }
  return collegeApRank(poll.ranks, game.home.id) ||
    collegeApRank(poll.ranks, game.away.id)
    ? 'ranked-regular-season'
    : null
}
