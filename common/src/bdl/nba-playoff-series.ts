import { MINUTE_MS } from '../util/time'
import { parseSportsKickoffMs } from '../sports-kickoff-interface'
import { normalizeBdlStatus, type ProviderGameStatus } from '../sports-provider'

type Pair<T> = [T, T]
type Conference = 'East' | 'West'
export type NbaPlayoffTeam = {
  id: number
  name: string
  abbreviation: string | null
  conference: Conference | null
}
export type NbaPlayoffGame = {
  id: number
  startTime: number | null
  homeId: number
  awayId: number
  status: ProviderGameStatus
  scores: Pair<number> | null
}
export type NbaPlayoffSeries = {
  eventId: string
  teams: Pair<NbaPlayoffTeam>
  wins: Pair<number>
  games: NbaPlayoffGame[]
  winnerId: number | null
  clinchingGameId: number | null
  review: string[]
  nextSeriesId: string | null
  round: 1 | 2 | 3 | 4 | null
}
export type NbaPlayoffBracket = {
  season: number
  championEventId: string
  series: NbaPlayoffSeries[]
  /** Derived only from a complete four-round elimination tree. */
  champion: { teamId: number; seriesId: string; clinchingGameId: number } | null
  review: string[]
}

const positive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const score = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const row = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined
const label = (v: unknown) =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
const nameKey = (s: string) =>
  label(
    s.normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu, '')
  ).toLocaleLowerCase('en-US')
const team = (v: unknown): NbaPlayoffTeam | null => {
  const t = row(v)
  if (!t || !positive(t.id) || !nameKey(label(t.full_name))) return null
  return {
    id: t.id,
    name: label(t.full_name),
    abbreviation: label(t.abbreviation) || null,
    conference:
      t.conference === 'East' || t.conference === 'West' ? t.conference : null,
  }
}

export function nbaPlayoffSeason(season: number) {
  // This tranche uses the contemporary sixteen-team, best-of-seven bracket.
  // Extend deliberately when a season with a different format is introduced.
  return Number.isSafeInteger(season) && season >= 2025 && season <= 2026
}
export function nbaSeriesEventId(season: number, a: number, b: number) {
  if (!nbaPlayoffSeason(season) || !positive(a) || !positive(b) || a === b)
    throw Error('Invalid NBA series identity')
  return `bdl:nba-series:${season}:${Math.min(a, b)}-${Math.max(a, b)}`
}
const played = (g: NbaPlayoffGame) =>
  g.status === 'final' || g.status === 'in_progress' || g.status === 'suspended'
function flag(reasons: string[], issue: string) {
  if (!reasons.includes(issue)) reasons.push(issue)
}
// NBA Rule No. 5, Section II(a): four regulation periods of twelve minutes.
const nbaRegulationMs = 4 * 12 * MINUTE_MS
function checkPlayedWindows(series: NbaPlayoffSeries[]) {
  type Start = {
    at: number
    series: NbaPlayoffSeries
    status: ProviderGameStatus
  }
  const starts = new Map<number, Start[]>()
  for (const s of series) {
    for (const g of s.games) {
      if (!played(g) || g.startTime === null) continue
      for (const id of [g.homeId, g.awayId]) {
        const list = starts.get(id) ?? []
        list.push({ at: g.startTime, series: s, status: g.status })
        starts.set(id, list)
      }
    }
  }
  for (const list of starts.values()) {
    list.sort((a, b) => a.at - b.at)
    let lastFinal: Start | undefined
    let prior: Start | undefined
    for (const next of list) {
      const collision =
        lastFinal && next.at - lastFinal.at < nbaRegulationMs
          ? lastFinal
          : prior?.at === next.at
          ? prior
          : undefined
      if (collision) {
        for (const s of [collision.series, next.series])
          flag(s.review, 'Played NBA fixtures overlap for the same entrant')
      }
      if (next.status === 'final') lastFinal = next
      prior = next
    }
  }
}
function tally(s: NbaPlayoffSeries) {
  s.games.sort(
    (a, b) =>
      (a.startTime ?? Infinity) - (b.startTime ?? Infinity) || a.id - b.id
  )
  const playedTimes = new Set<number>()
  let clinchAt: number | null = null
  for (const g of s.games) {
    if (g.status === 'unknown' || g.status === 'abandoned')
      flag(s.review, 'Unrecognized or abandoned playoff game')
    if (!played(g)) continue
    if (g.startTime === null || playedTimes.has(g.startTime)) {
      flag(s.review, 'Game chronology is ambiguous')
    } else playedTimes.add(g.startTime)
    if (clinchAt !== null) flag(s.review, 'Game played after a series clincher')
    if (g.status !== 'final') continue
    if (!g.scores || g.scores[0] === g.scores[1]) {
      flag(s.review, 'Final lacks a decisive score')
      continue
    }
    const winner = g.scores[0] > g.scores[1] ? g.homeId : g.awayId
    const side = s.teams[0].id === winner ? 0 : 1
    s.wins[side]++
    if (s.wins[side] === 4) {
      s.winnerId = winner
      s.clinchingGameId = g.id
      clinchAt = g.startTime
    }
  }
  if (
    s.winnerId &&
    s.games.some((g) => g.status === 'in_progress' || g.status === 'suspended')
  )
    flag(s.review, 'An active game conflicts with the clinched series')
  const clinchTime = clinchAt
  if (
    clinchTime !== null &&
    s.games.some(
      (g) =>
        (g.status === 'scheduled' ||
          g.status === 'delayed' ||
          g.status === 'postponed') &&
        (g.startTime === null || g.startTime <= clinchTime)
    )
  ) {
    flag(s.review, 'Unresolved fixture may precede the fourth win')
  }
  if (s.review.length) {
    s.winnerId = null
    s.clinchingGameId = null
  }
}

function inferBracket(bracket: NbaPlayoffBracket, complete: boolean) {
  if (!complete || bracket.review.length) return
  // A team can advance only from a strictly earlier, already clinched pair.
  // No next fixture during a live postseason is evidence of scheduling only.
  const timeline = new Map<number, NbaPlayoffSeries[]>()
  const first = new Map<string, number>()
  for (const s of bracket.series) {
    const at = s.games
      .filter((g) => g.status !== 'canceled' && g.status !== 'postponed')
      .map((g) => g.startTime)
      .find((t) => t !== null)
    if (at === undefined || at === null) continue
    first.set(s.eventId, at)
    for (const t of s.teams) {
      const list = timeline.get(t.id) ?? []
      list.push(s)
      timeline.set(t.id, list)
    }
  }
  const disputed = new Set<NbaPlayoffSeries>()
  const parents = new Map<string, NbaPlayoffSeries[]>()
  for (const [entrant, list] of timeline) {
    list.sort((a, b) => first.get(a.eventId)! - first.get(b.eventId)!)
    let disputedPath = false
    for (let i = 1; i < list.length; i++) {
      const before = list[i - 1],
        after = list[i]
      const end = before.games.find(
        (g) => g.id === before.clinchingGameId
      )?.startTime
      if (
        disputedPath ||
        before.winnerId !== entrant ||
        end == null ||
        end >= first.get(after.eventId)!
      ) {
        disputedPath = true
        disputed.add(after)
        continue
      }
      const prev = parents.get(after.eventId) ?? []
      prev.push(before)
      parents.set(after.eventId, prev)
    }
  }
  if (disputed.size) {
    const reason = 'Entrant advancement conflicts with the observed games'
    flag(bracket.review, reason)
    for (const s of disputed) {
      flag(s.review, reason)
      s.winnerId = null
      s.clinchingGameId = null
    }
    return
  }
  if (timeline.size !== 16 || bracket.series.some((s) => s.review.length))
    return
  const ranked = new Map<string, 1 | 2 | 3 | 4>()
  const sizes = [0, 0, 0, 0]
  const ordered = bracket.series
    .filter((s) => first.has(s.eventId))
    .sort((a, b) => first.get(a.eventId)! - first.get(b.eventId)!)
  for (const s of ordered) {
    const prior = parents.get(s.eventId) ?? []
    if (prior.length !== 0 && prior.length !== 2) return
    const [one, two] = prior.map((p) => ranked.get(p.eventId))
    const round =
      prior.length === 0 ? 1 : one !== undefined && one === two ? one + 1 : 0
    if (round !== 1 && round !== 2 && round !== 3 && round !== 4) return
    const [a, b] = s.teams
    if (
      !a.conference ||
      !b.conference ||
      (round === 4) !== (a.conference !== b.conference)
    )
      return
    sizes[round - 1]++
    ranked.set(s.eventId, round)
  }
  if (sizes[0] !== 8 || sizes[1] > 4 || sizes[2] > 2 || sizes[3] > 1) return
  // A scheduled fixture can establish a potential pairing, but cannot prove an entrant debuted.
  const firstPlayed = (s: NbaPlayoffSeries) =>
    s.games.find(played)?.startTime ?? Infinity
  const secondRoundStart = Math.min(
    ...ordered.filter((s) => ranked.get(s.eventId) === 2).map(firstPlayed)
  )
  if (
    Number.isFinite(secondRoundStart) &&
    ordered.some(
      (s) => ranked.get(s.eventId) === 1 && firstPlayed(s) >= secondRoundStart
    )
  ) {
    flag(
      bracket.review,
      'Opening entrants were not established before the second round'
    )
    return
  }
  for (const s of ordered) {
    s.round = ranked.get(s.eventId) ?? null
    for (const p of parents.get(s.eventId) ?? []) p.nextSeriesId = s.eventId
  }
  if (
    bracket.series.length !== 15 ||
    sizes.join() !== '8,4,2,1' ||
    !bracket.series.every((s) => s.winnerId && s.clinchingGameId)
  )
    return
  const final = ordered.find((s) => s.round === 4)
  if (final?.winnerId && final.clinchingGameId)
    bracket.champion = {
      teamId: final.winnerId,
      seriesId: final.eventId,
      clinchingGameId: final.clinchingGameId,
    }
}

/** Only the caller that exhausts a scoped season listing may assert complete.
 * A row describes a game, never a provider-declared series or champion.
 */
export function projectNbaPlayoffSeries(
  season: number,
  source: readonly unknown[],
  complete: boolean
): NbaPlayoffBracket {
  if (!nbaPlayoffSeason(season)) throw Error('Unsupported NBA playoff season')
  const bracket: NbaPlayoffBracket = {
    season,
    championEventId: 'bdl:nba-champion:' + season,
    series: [],
    champion: null,
    review: [],
  }
  const groups = new Map<string, NbaPlayoffSeries>()
  const teams = new Map<number, NbaPlayoffTeam>()
  const disputedTeams = new Set<number>()
  const clubNames = new Map<string, number>()
  const disputedGames = new Set<number>()
  function remember(t: NbaPlayoffTeam | null) {
    if (!t) return
    const name = nameKey(t.name)
    const priorId = clubNames.get(name)
    if (priorId !== undefined && priorId !== t.id) {
      disputedTeams.add(priorId)
      disputedTeams.add(t.id)
    } else clubNames.set(name, t.id)
    const old = teams.get(t.id)
    if (
      old &&
      (nameKey(old.name) !== name ||
        (old.conference && t.conference && old.conference !== t.conference))
    ) {
      disputedTeams.add(t.id)
    } else if (!old || (!old.conference && t.conference)) teams.set(t.id, t)
  }
  const membership = new Map<number, boolean>()
  const seen = new Map<number, { eventId: string; game: NbaPlayoffGame }>()
  for (const v of source) {
    const r = row(v)
    if (!r || r.season !== season || typeof r.postseason !== 'boolean') {
      flag(bracket.review, 'Unverified season or postseason scope')
      continue
    }
    if (positive(r.id)) {
      const earlier = membership.get(r.id)
      if (earlier !== undefined)
        flag(bracket.review, 'Repeated provider game ID in the season listing')
      if (earlier !== undefined && earlier !== r.postseason) {
        disputedGames.add(r.id)
        flag(
          bracket.review,
          'Conflicting postseason membership for a provider game'
        )
      }
      membership.set(r.id, r.postseason)
    }
    const h = team(r.home_team),
      a = team(r.visitor_team)
    remember(h)
    remember(a)
    if (!r.postseason) continue
    if (
      !positive(r.id) ||
      !h ||
      !a ||
      h.id === a.id ||
      (r.ist_stage != null && r.ist_stage !== '')
    ) {
      if (positive(r.id)) disputedGames.add(r.id)
      flag(bracket.review, 'Unverified playoff game identity')
      continue
    }
    const eventId = nbaSeriesEventId(season, h.id, a.id)
    const sides: Pair<NbaPlayoffTeam> = h.id < a.id ? [h, a] : [a, h]
    let s = groups.get(eventId)
    if (!s) {
      s = {
        eventId,
        teams: sides,
        wins: [0, 0],
        games: [],
        winnerId: null,
        clinchingGameId: null,
        review: [],
        nextSeriesId: null,
        round: null,
      }
      groups.set(eventId, s)
    }
    const ms = parseSportsKickoffMs(
      typeof r.datetime === 'string' ? r.datetime : undefined
    )
    const status = normalizeBdlStatus(r.status_state, 'status_state')
    if (
      status === 'final' &&
      typeof r.status === 'string' &&
      /\b(?:forfeit(?:ed|ure)?|walkover|abandoned)\b/i.test(r.status)
    ) {
      disputedGames.add(r.id)
      flag(s.review, 'Exceptional NBA result requires review')
    }
    const game: NbaPlayoffGame = {
      id: r.id,
      startTime: Number.isFinite(ms) ? ms : null,
      homeId: h.id,
      awayId: a.id,
      status,
      scores:
        status === 'final' &&
        score(r.home_team_score) &&
        score(r.visitor_team_score)
          ? [r.home_team_score, r.visitor_team_score]
          : null,
    }
    const existing = seen.get(game.id)
    if (existing) {
      if (
        existing.eventId !== eventId ||
        JSON.stringify(game) !== JSON.stringify(existing.game)
      ) {
        disputedGames.add(game.id)
        flag(s.review, 'Provider game ID has conflicting records')
        flag(
          groups.get(existing.eventId)!.review,
          'Provider game ID has conflicting records'
        )
      }
      continue
    }
    seen.set(game.id, { eventId, game })
    s.games.push(game)
  }
  bracket.series = [...groups.values()].sort(
    (a, b) => a.teams[0].id - b.teams[0].id || a.teams[1].id - b.teams[1].id
  )
  for (const s of bracket.series)
    s.games = s.games.filter((g) => !disputedGames.has(g.id))
  checkPlayedWindows(bracket.series)
  for (const s of bracket.series) {
    if (nameKey(s.teams[0].name) === nameKey(s.teams[1].name))
      flag(s.review, 'Indistinguishable team names')
    if (s.teams.some((t) => disputedTeams.has(t.id))) {
      flag(bracket.review, 'Entrant identity changed in the season listing')
      flag(s.review, 'Conflicting entrant identity')
    }
  }
  for (const s of bracket.series) {
    tally(s)
    if (!complete || bracket.review.length) {
      s.winnerId = null
      s.clinchingGameId = null
    }
  }
  inferBracket(bracket, complete)
  return bracket
}
