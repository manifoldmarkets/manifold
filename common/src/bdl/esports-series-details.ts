import {
  readEsportsPage,
  type EsportsPage,
  esportsRow,
  esportsId,
  esportsText,
  esportsRef,
  esportsScores,
  type EsportsSeries,
  type SeriesScores,
  type EsportsRef,
} from './esports-series'
import { normalizeBdlStatus, type ProviderGameStatus } from '../sports-provider'

type SeriesMap = {
  id: number
  number: number
  name: string | null
  status: ProviderGameStatus
  winnerId: number | null
  roundScores: SeriesScores | null
}

const selects = (value: unknown, id: number) =>
  value === id || value === String(id)

export function readEsportsMapPage(
  series: EsportsSeries,
  response: EsportsPage
) {
  const page = readEsportsPage(response, '/' + series.league + '/v1/match_maps')
  if (
    !page ||
    !series.team1 ||
    !series.team2 ||
    series.team1.id === series.team2.id
  )
    return null
  const { team1, team2 } = series
  const params = response.request.params
  const scope = series.league === 'cs' ? params['match_ids[]'] : params.match_id
  if (
    !(Array.isArray(scope)
      ? scope.some((id) => selects(id, series.id))
      : selects(scope, series.id))
  )
    return null
  const results: SeriesMap[] = []
  const numbers = new Set<number>(),
    ids = new Set<number>()
  for (const value of page.rows) {
    const r = esportsRow(value)
    const matchId = r?.match_id
    if (!r || !esportsId(matchId)) return null
    if (matchId !== series.id) {
      if (
        series.league === 'cs' &&
        Array.isArray(scope) &&
        scope.some((id) => selects(id, matchId))
      )
        continue
      return null
    }
    const cs = series.league === 'cs',
      valorant = series.league === 'valorant'
    const number = cs ? r.map_number : r.game_number
    if (
      !esportsId(r.id) ||
      !esportsId(number) ||
      ids.has(r.id) ||
      numbers.has(number)
    )
      return null
    ids.add(r.id)
    numbers.add(number)
    const winner = esportsRow(r.winner)?.id,
      loser = esportsRow(r.loser)?.id
    if (r.winner != null && winner !== team1.id && winner !== team2.id)
      return null
    if (
      r.loser != null &&
      ((loser !== team1.id && loser !== team2.id) || loser === winner)
    )
      return null
    let scores: SeriesScores | null = null
    if (cs) scores = esportsScores(r.team1_score, r.team2_score)
    if (valorant && esportsId(winner) && esportsId(loser)) {
      scores =
        winner === team1.id
          ? esportsScores(r.winner_score, r.loser_score)
          : esportsScores(r.loser_score, r.winner_score)
    }
    const supportedWinner =
      winner === team1.id || winner === team2.id ? winner : null
    if (
      supportedWinner &&
      scores &&
      (scores.team1 === scores.team2 ||
        scores.team1 > scores.team2 !== (supportedWinner === team1.id))
    )
      return null
    const status = cs ? 'unknown' : normalizeBdlStatus(r.status_state)
    results.push({
      id: r.id,
      number,
      name: cs
        ? esportsText(r.map_name)
        : valorant
        ? esportsText(esportsRow(r.map)?.name)
        : null,
      status,
      winnerId: cs || status === 'final' ? supportedWinner : null,
      roundScores: cs && supportedWinner === null ? null : scores,
    })
  }
  return {
    maps: results.sort((a, b) => a.number - b.number),
    nextCursor: page.nextCursor,
  }
}

type Placement = {
  id: number
  team: EsportsRef
  label: string
  first: number
  last: number
}
export function readValorantPlacementPage(
  tournamentId: number,
  response: EsportsPage
) {
  const page = readEsportsPage(response, '/valorant/v1/tournament_prizes')
  if (
    !page ||
    !esportsId(tournamentId) ||
    !selects(response.request.params.tournament_id, tournamentId)
  )
    return null
  const prizes: Placement[] = []
  const teams = new Set<number>(),
    ids = new Set<number>()
  for (const value of page.rows) {
    const r = esportsRow(value)
    const team = esportsRef(r?.team),
      label = esportsText(r?.placement)
    if (
      !r ||
      r.tournament_id !== tournamentId ||
      !esportsId(r.id) ||
      !team ||
      !label ||
      teams.has(team.id) ||
      ids.has(r.id)
    )
      return null
    const rank = /^([1-9]\d*)(?:-([1-9]\d*))?(st|nd|rd|th)$/.exec(label)
    if (!rank) return null
    const first = Number(rank[1]),
      last = Number(rank[2] ?? rank[1])
    const mod = last % 100
    const suffix =
      mod >= 11 && mod <= 13
        ? 'th'
        : ['th', 'st', 'nd', 'rd'][last % 10] ?? 'th'
    if (
      !esportsId(first) ||
      !esportsId(last) ||
      first > last ||
      rank[3] !== suffix
    )
      return null
    teams.add(team.id)
    ids.add(r.id)
    prizes.push({ id: r.id, team, label, first, last })
  }
  return {
    placements: prizes.sort(
      (a, b) => a.first - b.first || a.last - b.last || a.id - b.id
    ),
    nextCursor: page.nextCursor,
  }
}
