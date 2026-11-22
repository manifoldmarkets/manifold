import { SPORTS_CALENDAR } from 'common/sports-calendar'
import { bdlEventId } from 'common/sports-ids'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import {
  normalizeBdlStatus,
  ProviderEntrant,
  ProviderGameStatus,
  ProviderOdds,
} from 'common/sports-provider'

export const CLUB_LEAGUES = [
  'epl',
  'laliga',
  'seriea',
  'bundesliga',
  'ligue1',
  'ucl',
  'mls',
] as const
export type ClubLeague = (typeof CLUB_LEAGUES)[number]
type Pair = { home: number; away: number }
type Hold =
  | 'invalid-schedule'
  | 'unverified-clubs'
  | 'conflicting-rows'
  | 'unverified-phase'
  | 'unverified-status'
  | 'unverified-regulation'
export type ClubMatch = {
  id: number
  eventId: string
  season: number | null
  startTime: string | null
  home: ProviderEntrant | null
  away: ProviderEntrant | null
  status: ProviderGameStatus
  statusDetail: string | null
  score: Pair | null
  halves: [Pair | null, Pair | null]
  competition: { id: string; phase: string } | null
  hold: Hold | null
  regulationResult: { winnerId: string } | 'draw' | null
}
export type ClubSlate = {
  league: ClubLeague
  matches: ClubMatch[]
  /** A returned row had no usable ID or fell outside the requested season/date scope. */
  incomplete: boolean
}
export const clubRow = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const id = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const goals = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const pair = (home: unknown, away: unknown): Pair | null =>
  goals(home) && goals(away) ? { home, away } : null
export const clubTime = (value: unknown) =>
  typeof value === 'string'
    ? parseSportsKickoffMs(
        value.replace(/([.]\d{3})\d+(?=Z$|[+-]\d{2}:\d{2}$)/, '$1')
      )
    : NaN

const unresolvedClub =
  /^(?:t\s*b\s*[dac]|unknown|n\s*\/\s*a|to be (?:determined|decided|announced|confirmed)|(?:winner|loser) (?:of\b.*|(?:match|tie|quarterfinal|semifinal) \d+))$/i

function directory(rows: readonly unknown[]) {
  const teams = new Map<number, ProviderEntrant | null>()
  for (const raw of rows) {
    const r = clubRow(raw)
    if (!id(r.id)) continue
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const previous = teams.get(r.id)
    teams.set(
      r.id,
      !name ||
        unresolvedClub.test(
          name.replace(/\.\s*/gu, '').replace(/\s+/gu, ' ')
        ) ||
        previous === null ||
        (previous && previous.name !== name)
        ? null
        : { id: String(r.id), name }
    )
  }
  return teams
}

/** Date alone cannot move an MLS playoff or a UCL knockout into regulation settlement. */
function competitionFor(league: ClubLeague, season: number, day: string) {
  // Neither recorded match feed provides an unambiguous phase discriminator.
  // A calendar window and a numeric round cannot identify the competition format.
  if (league === 'ucl' || league === 'mls') return null
  const competitionId =
    league + '-' + season + '-' + String(season + 1).slice(-2)
  const onDate = SPORTS_CALENDAR.filter(
    (c) =>
      c.sport === 'soccer' &&
      c.competitionId === competitionId &&
      c.startDate <= day &&
      day <= c.endDate
  )
  if (onDate.length !== 1 || onDate[0].locked) return null
  return onDate[0].phase === 'Season'
    ? { id: competitionId, phase: onDate[0].phase }
    : null
}

const sourceStates: Readonly<Record<string, ProviderGameStatus | undefined>> = {
  STATUS_SCHEDULED: 'scheduled',
  STATUS_FIRST_HALF: 'in_progress',
  STATUS_HALFTIME: 'in_progress',
  STATUS_SECOND_HALF: 'in_progress',
  STATUS_FULL_TIME: 'final',
  STATUS_POSTPONED: 'postponed',
  STATUS_SUSPENDED: 'suspended',
  STATUS_CANCELED: 'canceled',
  STATUS_DELAYED: 'delayed',
  STATUS_ABANDONED: 'abandoned',
}

// The archived human-readable schedules identify the US Eastern zone explicitly.
// Format the confirmed instant into that zone, including its DST designation,
// rather than parsing a yearless date in the server's local time zone.
const easternKickoff = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
})
function matchesKickoffDetail(text: string, at: number) {
  if (!Number.isFinite(at)) return false
  const parts = Object.fromEntries(
    easternKickoff.formatToParts(at).map((p) => [p.type, p.value])
  )
  const day = Number(parts.day)
  const suffix =
    day >= 11 && day <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ??
        'th'
  const date = parts.weekday + ', ' + parts.month + ' ' + parts.day
  const time =
    ' at ' +
    parts.hour +
    ':' +
    parts.minute +
    ' ' +
    parts.dayPeriod +
    ' ' +
    parts.timeZoneName
  return text === date + suffix + time || text === date + time
}

// Confirmed scheduled rows carry no interval scores; their aggregate can be 0–0.
function verifiedPregame(r: Record<string, unknown>, at: number) {
  const detail = r.status_detail
  if (detail != null) {
    if (typeof detail !== 'string') return false
    const text = detail.trim()
    if (
      text &&
      !/^(?:NS|scheduled|not started|TBD)$/i.test(text) &&
      !matchesKickoffDetail(text, at)
    )
      return false
  }
  return (
    [r.home_score, r.away_score].every((v) => v == null || v === 0) &&
    [
      r.first_half_home_score,
      r.first_half_away_score,
      r.second_half_home_score,
      r.second_half_away_score,
    ].every((v) => v == null)
  )
}

function conflictingMatch(match: ClubMatch): ClubMatch {
  return {
    ...match,
    season: null,
    startTime: null,
    home: null,
    away: null,
    status: 'unknown',
    statusDetail: null,
    score: null,
    halves: [null, null],
    competition: null,
    hold: 'conflicting-rows',
    regulationResult: null,
  }
}

/** Decode one complete acquisition. Different times are separate observations, not duplicate rows. */
export function decodeClubSlate(
  league: ClubLeague,
  season: number,
  teams: readonly unknown[],
  rows: readonly unknown[],
  dates?: ReadonlySet<string>
): ClubSlate {
  const clubs = directory(teams)
  const matches = new Map<number, ClubMatch>()
  const outsideScope = new Set<number>()
  let incomplete = false
  for (const raw of rows) {
    const r = clubRow(raw)
    if (!id(r.id)) {
      incomplete = true
      continue
    }
    const at = clubTime(r.date)
    const startTime = Number.isFinite(at) ? new Date(at).toISOString() : null
    if (
      (id(r.season) && r.season !== season) ||
      (dates && startTime && !dates.has(startTime.slice(0, 10)))
    ) {
      outsideScope.add(r.id)
      incomplete = true
      continue
    }
    if (!startTime || r.season !== season) incomplete = true
    const home = id(r.home_team_id) ? clubs.get(r.home_team_id) ?? null : null
    const away = id(r.away_team_id) ? clubs.get(r.away_team_id) ?? null : null
    const status = normalizeBdlStatus(r.status_state)
    const sourceState =
      typeof r.status === 'string' ? sourceStates[r.status] : undefined
    const statusDetail =
      typeof r.status_detail === 'string' ? r.status_detail : null
    const score = pair(r.home_score, r.away_score)
    const first = pair(r.first_half_home_score, r.first_half_away_score)
    const second = pair(r.second_half_home_score, r.second_half_away_score)
    const halves: ClubMatch['halves'] = [first, second]
    const competition =
      r.season === season && startTime
        ? competitionFor(league, season, startTime.slice(0, 10))
        : null
    const isFt = r.status === 'STATUS_FULL_TIME' && statusDetail === 'FT'
    const exceptionalRound =
      r.round_number != null &&
      (!id(r.round_number) ||
        (league === 'ucl'
          ? r.round_number > 8
          : league === 'bundesliga' || league === 'ligue1'
          ? r.round_number > 34
          : league !== 'mls' && r.round_number > 38))
    const exceptional =
      exceptionalRound ||
      /EXTRA|PENALTY|FINAL_PEN|FINAL_AET|AWARD|FORFEIT|WALKOVER/i.test(
        String(r.status)
      ) ||
      /^(?:AET|PEN|AWD|WO)\b/i.test(statusDetail ?? '')
    let hold: Hold | null = null
    if (!startTime || r.season !== season) hold = 'invalid-schedule'
    else if (
      !home ||
      !away ||
      home.id === away.id ||
      home.name.toLowerCase() === away.name.toLowerCase()
    )
      hold = 'unverified-clubs'
    else if (exceptional || !competition) hold = 'unverified-phase'
    else if (
      status === 'unknown' ||
      sourceState !== status ||
      (status === 'scheduled' && !verifiedPregame(r, at)) ||
      (status === 'final') !== isFt
    )
      hold = 'unverified-status'
    else if (
      isFt &&
      (!score ||
        !first ||
        !second ||
        first.home + second.home !== score.home ||
        first.away + second.away !== score.away)
    )
      hold = 'unverified-regulation'
    const regulationResult =
      !hold && status === 'final' && score && home && away
        ? score.home === score.away
          ? 'draw'
          : { winnerId: score.home > score.away ? home.id : away.id }
        : null
    const match: ClubMatch = {
      id: r.id,
      eventId: bdlEventId(league, r.id),
      season: id(r.season) ? r.season : null,
      startTime,
      home,
      away,
      status,
      statusDetail,
      score,
      halves,
      competition,
      hold,
      regulationResult,
    }
    const prior = matches.get(r.id)
    if (prior && JSON.stringify(prior) !== JSON.stringify(match)) {
      matches.set(r.id, conflictingMatch(match))
    } else matches.set(r.id, match)
  }
  for (const id of outsideScope) {
    const match = matches.get(id)
    if (match) matches.set(id, conflictingMatch(match))
  }
  return { league, matches: [...matches.values()], incomplete }
}

export function isClubPregameAt(match: ClubMatch, observedAt: number) {
  return (
    !match.hold &&
    match.status === 'scheduled' &&
    Number.isFinite(observedAt) &&
    clubTime(match.startTime) > observedAt
  )
}

/** Preserve later partial or withdrawn rows so the common opening-line selector cannot use superseded prices. */
export function decodeClubOdds(
  matches: readonly ClubMatch[],
  rows: readonly unknown[],
  observedAt: number
) {
  const byId = new Map(matches.map((match) => [match.id, match]))
  const quotes = new Map<number, ProviderOdds[]>(
    matches.map((match) => [match.id, []])
  )
  const unknownVendor = new Set<number>()
  const withdrawn = new Map<number, Set<string>>()
  for (const raw of rows) {
    const r = clubRow(raw)
    const match = id(r.match_id) ? byId.get(r.match_id) : undefined
    if (
      !match ||
      !isClubPregameAt(match, observedAt) ||
      !match.home ||
      !match.away
    )
      continue
    if (typeof r.vendor !== 'string' || !r.vendor.trim()) {
      unknownVendor.add(match.id)
      continue
    }
    const vendor = r.vendor.trim().toLowerCase()
    const updatedAtMs = clubTime(r.updated_at)
    // A malformed or future update cannot establish which of this book's
    // quotes is current. Other identified books remain independent.
    if (!Number.isFinite(updatedAtMs) || updatedAtMs > observedAt) {
      const vendors = withdrawn.get(match.id) ?? new Set<string>()
      vendors.add(vendor)
      withdrawn.set(match.id, vendors)
      continue
    }
    const outcomes: ProviderOdds['outcomes'][number][] = []
    for (const [outcome, price] of [
      [{ entrantId: match.home.id }, r.moneyline_home_odds],
      [{ entrantId: match.away.id }, r.moneyline_away_odds],
      ['draw', r.moneyline_draw_odds],
    ] as const)
      if (typeof price === 'number' && Number.isFinite(price))
        outcomes.push({ outcome, americanOdds: price })
    quotes.get(match.id)!.push({
      eventId: match.eventId,
      vendor,
      updatedAtMs,
      outcomes,
    })
  }
  for (const [id, vendors] of withdrawn)
    quotes.set(
      id,
      quotes.get(id)!.filter((q) => !vendors.has(q.vendor))
    )
  for (const id of unknownVendor) quotes.set(id, [])
  return quotes
}
