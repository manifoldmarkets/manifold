// Excerpts of real BALLDONTLIE matches for the esports tests, cut down to the
// fields the reader uses: IDs, names, stage, round, position, scores, winner,
// status and start time. No prices, no odds, no raw responses.
//
// One line per team:   id | name | short name or acronym
// One line per match:  id | start (UTC) | round label (CS2) or position
//                      (Valorant) | team 1 | score | team 2 | winner |
//                      best of | status
// A dash means the provider sent nothing.
import type { EsportsGame } from './types'

export type RecordedStage = {
  game: EsportsGame
  tournament: { id: number; name: string; tier?: string | null }
  stage: {
    id: number
    name: string
    stage_type?: string | null
    stage_order?: number | null
    rounds_count?: number | null
  } | null
  teams: string
  matches: string
}

const STATUS_STATE: Record<string, string> = {
  finished: 'final',
  defwin: 'final',
  upcoming: 'scheduled',
  current: 'in_progress',
}
const cells = (block: string) =>
  block
    .trim()
    .split('\n')
    .map((line) => line.split('|').map((cell) => cell.trim()))
const sent = (cell: string) => (cell === '-' ? null : cell)
const numberSent = (cell: string) => (cell === '-' ? null : Number(cell))

/** Rebuilds the provider's match rows, in each game's own field names. */
export function providerRows(recorded: RecordedStage) {
  const { game, tournament, stage } = recorded
  const teams = cells(recorded.teams)
  const team = (cell: string) => {
    const found = teams.find((t) => t[0] === cell)
    if (!found) return null
    const [id, name, code] = [Number(found[0]), found[1], sent(found[2])]
    if (game === 'cs') return { id, name, short_name: code }
    return game === 'valorant' ? { id, name, acronym: code } : { id, name }
  }
  return cells(recorded.matches).map((match): Record<string, unknown> => {
    const [id, start, label, team1, score, team2, winner, bestOf, status] =
      match
    const time =
      start === '-'
        ? null
        : start + (start.length === 16 ? ':00.000Z' : '.000Z')
    const [score1, score2] =
      score === '-' ? [null, null] : score.split('-').map(Number)
    const common = {
      id: Number(id),
      tournament,
      team1: team(team1),
      team2: team(team2),
      team1_score: score1,
      team2_score: score2,
      winner: team(winner),
      status,
      status_state: STATUS_STATE[status],
    }
    const best = numberSent(bestOf)
    if (game === 'cs')
      return {
        ...common,
        stage,
        round: sent(label),
        best_of: best,
        start_time: time,
      }
    if (game === 'valorant') {
      const loser =
        winner === '-' ? null : team(winner === team1 ? team2 : team1)
      const position = numberSent(label)
      return { ...common, stage, position, loser, start_at: time }
    }
    const empty = game === 'dota' ? { stage: null } : {}
    return { ...common, ...empty, bo_type: best, start_date: time }
  })
}

/** The Valorant `/tournament_stages` rows recorded for `vctEuropePlayoffs`. */
export const VCT_EUROPE_STAGE_ROWS = [
  {
    id: 97960,
    tournament_id: 1427202,
    name: 'VCT 2027: EMEA Kickoff: Europe - Qualifier 1 Playoffs',
    format: 'playoff',
    sequence: 1,
    subgroup: 2,
    promotion_team_count: null,
  },
  {
    id: 97961,
    tournament_id: 1427202,
    name: 'VCT 2027: EMEA Kickoff: Europe - Qualifier 1 Decider',
    format: 'playoff',
    sequence: 2,
    subgroup: 2,
    promotion_team_count: null,
  },
]

export const RECORDED = {
  // CS2 Swiss, live after three rounds: round four is paired but not yet labelled.
  pglStage1: {
    game: 'cs',
    tournament: {
      id: 477506,
      name: 'PGL Major Singapore 2026 Stage 1',
      tier: 's',
    },
    stage: {
      id: 44011,
      name: 'PGL Major Singapore 2026 Stage 1 Stage 1',
      stage_type: 'swiss',
      stage_order: 1,
      rounds_count: 5,
    },
    teams: `
      739 | HEROIC | HERO
      1353 | Imperial | IMP
      316 | 9z | 9z
      465 | Lynn Vision | LVG
      763 | Ninjas in Pyjamas | NIP
      5280 | M80 | M80
      453 | 100 Thieves | 100T
      6074 | Chinggis Warriors | CW
      768 | Liquid | TL
      6517 | BC.Game | -
      5567 | PARIVISION | PV
      83723 | DENDELE | -
      769 | FaZe | FaZe
      4959 | Wildcard | WC
      1445 | Eternal Fire | EF
      6303 | FlyQuest | FLY
    `,
    matches: `
      19142550 | 2026-11-24T04:00 | Round 1 | 739 | 0-1 | 1353 | 1353 | 1 | finished
      19142552 | 2026-11-24T04:00 | Round 1 | 316 | 0-1 | 465 | 465 | 1 | finished
      19142548 | 2026-11-24T05:00 | Round 1 | 763 | 1-0 | 5280 | 763 | 1 | finished
      19142551 | 2026-11-24T05:25 | Round 1 | 453 | 1-0 | 6074 | 453 | 1 | finished
      19142546 | 2026-11-24T06:10 | Round 1 | 768 | 1-0 | 6517 | 768 | 1 | finished
      19142545 | 2026-11-24T06:25 | Round 1 | 5567 | 1-0 | 83723 | 5567 | 1 | finished
      19142547 | 2026-11-24T07:00 | Round 1 | 769 | 0-1 | 4959 | 4959 | 1 | finished
      19142549 | 2026-11-24T07:15 | Round 1 | 1445 | 0-1 | 6303 | 6303 | 1 | finished
      19910425 | 2026-11-24T08:45 | Round 2 | 739 | 1-0 | 6074 | 739 | 1 | finished
      19910426 | 2026-11-24T08:45 | Round 2 | 763 | 1-0 | 465 | 763 | 1 | finished
      19910424 | 2026-11-24T09:35 | Round 2 | 316 | 0-1 | 5280 | 5280 | 1 | finished
      19910423 | 2026-11-24T10:00 | Round 2 | 453 | 0-1 | 1353 | 1353 | 1 | finished
      19910422 | 2026-11-24T10:50 | Round 2 | 1445 | 1-0 | 83723 | 1445 | 1 | finished
      19910421 | 2026-11-24T11:00 | Round 2 | 5567 | 0-1 | 6303 | 6303 | 1 | finished
      19910419 | 2026-11-24T12:00 | Round 2 | 768 | 1-0 | 4959 | 768 | 1 | finished
      19910420 | 2026-11-24T12:10 | Round 2 | 769 | 1-0 | 6517 | 769 | 1 | finished
      19910415 | 2026-11-25T06:00 | Round 3 | 739 | 0-1 | 5280 | 5280 | 1 | finished
      19910416 | 2026-11-25T06:00 | Round 3 | 1445 | 1-0 | 453 | 1445 | 1 | finished
      19910414 | 2026-11-25T07:00 | Round 3 | 4959 | 0-1 | 465 | 465 | 1 | finished
      19910413 | 2026-11-25T07:15 | Round 3 | 5567 | 1-0 | 769 | 5567 | 1 | finished
      19910412 | 2026-11-25T08:10 | Round 3 | 316 | 2-0 | 83723 | 316 | 3 | finished
      19910411 | 2026-11-25T08:30 | Round 3 | 1353 | 0-2 | 6303 | 6303 | 3 | finished
      19910410 | 2026-11-25T10:10 | Round 3 | 6517 | 1-2 | 6074 | 6074 | 3 | finished
      19910409 | 2026-11-25T11:00 | Round 3 | 763 | 2-0 | 768 | 763 | 3 | finished
      19910407 | 2026-11-26T06:00 | - | 5280 | 0-0 | 1445 | - | 3 | upcoming
      19910408 | 2026-11-26T06:00 | - | 739 | 0-0 | 769 | - | 3 | upcoming
      19910405 | 2026-11-26T08:30 | - | 465 | 0-0 | 5567 | - | 3 | upcoming
      19910406 | 2026-11-26T08:30 | - | 453 | 0-0 | 316 | - | 3 | upcoming
      19910403 | 2026-11-26T11:00 | - | 1353 | 0-0 | 768 | - | 3 | upcoming
      19910404 | 2026-11-26T11:00 | - | 4959 | 0-0 | 6074 | - | 3 | upcoming
      19910402 | 2026-11-27T06:00 | - | - | - | - | - | 3 | upcoming
      19910401 | 2026-11-27T08:30 | - | - | - | - | - | 3 | upcoming
      19910400 | 2026-11-27T11:00 | - | - | - | - | - | 3 | upcoming
    `,
  },
  // Excerpt. The provider lists Stage 2 of the Major as its own tournament.
  pglStage2: {
    game: 'cs',
    tournament: {
      id: 477508,
      name: 'PGL Major Singapore 2026 Stage 2',
      tier: 's',
    },
    stage: {
      id: 44012,
      name: 'PGL Major Singapore 2026 Stage 2 Stage 2',
      stage_type: 'swiss',
      stage_order: 1,
      rounds_count: 5,
    },
    teams: `
    `,
    matches: `
      19914120 | 2026-11-28T04:00 | - | - | - | - | - | 1 | upcoming
      19914085 | 2026-12-01T11:00 | - | - | - | - | - | 3 | upcoming
    `,
  },
  // Excerpt. Stage 3 and the playoffs sit in the tournament with the base name.
  pglStage3: {
    game: 'cs',
    tournament: { id: 2353, name: 'PGL Major Singapore 2026', tier: 's' },
    stage: {
      id: 44013,
      name: 'PGL Major Singapore 2026 Stage 3',
      stage_type: 'swiss',
      stage_order: 1,
      rounds_count: 5,
    },
    teams: `
    `,
    matches: `
      19914083 | 2026-12-02T04:00 | - | - | - | - | - | 3 | upcoming
      19914051 | 2026-12-06T11:00 | - | - | - | - | - | 3 | upcoming
    `,
  },
  // Excerpt. An unplayed playoff has no round labels.
  pglPlayoffs: {
    game: 'cs',
    tournament: { id: 2353, name: 'PGL Major Singapore 2026', tier: 's' },
    stage: {
      id: 44014,
      name: 'PGL Major Singapore 2026 Playoffs',
      stage_type: 'playoff',
      stage_order: 4,
      rounds_count: 3,
    },
    teams: `
    `,
    matches: `
      19914050 | 2026-12-10T09:00 | - | - | - | - | - | 3 | upcoming
      19914033 | 2026-12-13T10:00 | - | - | - | - | - | 5 | upcoming
    `,
  },
  // A one-series stage with no stage_order.
  pglDecider: {
    game: 'cs',
    tournament: { id: 2353, name: 'PGL Major Singapore 2026', tier: 's' },
    stage: {
      id: 48045,
      name: 'PGL Major Singapore 2026 Decider',
      stage_type: 'playoff',
      stage_order: null,
      rounds_count: 1,
    },
    teams: `
    `,
    matches: `
      19914034 | 2026-12-13T06:30 | - | - | - | - | - | 3 | upcoming
    `,
  },
  // CS2 Swiss that the provider sends as stage_type "group".
  bucharestGroup: {
    game: 'cs',
    tournament: { id: 18615, name: 'PGL Masters Bucharest 2026', tier: 's' },
    stage: {
      id: 9268,
      name: 'PGL Masters Bucharest 2026 Group Stage',
      stage_type: 'group',
      stage_order: 1,
      rounds_count: 5,
    },
    teams: `
      7278 | FUT | FUT
      737 | TYLOO | TYLOO
      2766 | Aurora | AUR
      717 | The MongolZ | MGLZ
      745 | MOUZ | MOUZ
      768 | Liquid | TL
      637 | Spirit | TS
      5343 | BetBoom | BB
      5556 | Legacy | LGC
      638 | Nemiga | NEMI
      650 | Vitality | VIT
      316 | 9z | 9z
      631 | FURIA | FURIA
      83723 | DENDELE | -
      771 | G2 | G2
      765 | Natus Vincere | NAVI
    `,
    matches: `
      18019106 | 2026-10-24T07:00 | Round 1 | 7278 | 2-0 | 737 | 7278 | 3 | finished
      18019105 | 2026-10-24T07:10 | Round 1 | 2766 | 1-2 | 717 | 717 | 3 | finished
      18019100 | 2026-10-24T09:15 | Round 1 | 745 | 1-2 | 768 | 768 | 3 | finished
      18019099 | 2026-10-24T10:40 | Round 1 | 637 | 1-2 | 5343 | 5343 | 3 | finished
      18019093 | 2026-10-24T12:55 | Round 1 | 5556 | 0-2 | 638 | 638 | 3 | finished
      18019092 | 2026-10-24T14:00 | Round 1 | 650 | 2-0 | 316 | 650 | 3 | finished
      18019088 | 2026-10-24T16:15 | Round 1 | 631 | 2-0 | 83723 | 631 | 3 | finished
      18019087 | 2026-10-24T16:25 | Round 1 | 771 | 0-2 | 765 | 765 | 3 | finished
      18041501 | 2026-10-25T08:00 | Round 2 | 637 | 2-0 | 737 | 637 | 3 | finished
      18041502 | 2026-10-25T08:00 | Round 2 | 7278 | 2-0 | 768 | 7278 | 3 | finished
      18041496 | 2026-10-25T09:50 | Round 2 | 650 | 2-0 | 717 | 650 | 3 | finished
      18041498 | 2026-10-25T10:05 | Round 2 | 5343 | 2-0 | 638 | 5343 | 3 | finished
      18041490 | 2026-10-25T13:00 | Round 2 | 745 | 2-0 | 316 | 745 | 3 | finished
      18041489 | 2026-10-25T13:10 | Round 2 | 771 | 0-2 | 2766 | 2766 | 3 | finished
      18041483 | 2026-10-25T14:55 | Round 2 | 5556 | 2-0 | 83723 | 5556 | 3 | finished
      18041485 | 2026-10-25T15:45 | Round 2 | 631 | 0-2 | 765 | 765 | 3 | finished
      18041479 | 2026-10-26T08:00 | Round 3 | 638 | 0-2 | 2766 | 2766 | 3 | finished
      18041480 | 2026-10-26T08:00 | Round 3 | 717 | 0-2 | 745 | 745 | 3 | finished
      18041476 | 2026-10-26T10:25 | Round 3 | 650 | 1-2 | 7278 | 7278 | 3 | finished
      18041477 | 2026-10-26T11:00 | Round 3 | 316 | 1-2 | 737 | 737 | 3 | finished
      18041473 | 2026-10-26T13:45 | Round 3 | 637 | 2-1 | 631 | 637 | 3 | finished
      18041472 | 2026-10-26T14:10 | Round 3 | 768 | 2-0 | 5556 | 768 | 3 | finished
      18041469 | 2026-10-26T16:30 | Round 3 | 771 | 1-2 | 83723 | 83723 | 3 | finished
      18041468 | 2026-10-26T17:00 | Round 3 | 5343 | 2-0 | 765 | 5343 | 3 | finished
      18041449 | 2026-10-27T11:00 | Round 4 | 638 | 2-0 | 83723 | 638 | 3 | finished
      18041451 | 2026-10-27T11:10 | Round 4 | 768 | 1-2 | 2766 | 2766 | 3 | finished
      18041445 | 2026-10-27T13:00 | Round 4 | 717 | 2-0 | 5556 | 717 | 3 | finished
      18041444 | 2026-10-27T14:35 | Round 4 | 637 | 1-2 | 745 | 745 | 3 | finished
      18041440 | 2026-10-27T16:20 | Round 4 | 631 | 2-0 | 737 | 631 | 3 | finished
      18041439 | 2026-10-27T17:55 | Round 4 | 650 | 2-0 | 765 | 650 | 3 | finished
      18041433 | 2026-10-28T11:00 | Round 5 | 717 | 0-2 | 638 | 638 | 3 | finished
      18041429 | 2026-10-28T13:40 | Round 5 | 768 | 0-2 | 631 | 631 | 3 | finished
      18041426 | 2026-10-28T16:00 | Round 5 | 637 | 1-2 | 765 | 765 | 3 | finished
    `,
  },
  // CS2 single elimination.
  bucharestPlayoffs: {
    game: 'cs',
    tournament: { id: 18615, name: 'PGL Masters Bucharest 2026', tier: 's' },
    stage: {
      id: 9269,
      name: 'PGL Masters Bucharest 2026 Playoffs',
      stage_type: 'playoff',
      stage_order: 2,
      rounds_count: 3,
    },
    teams: `
      7278 | FUT | FUT
      638 | Nemiga | NEMI
      650 | Vitality | VIT
      765 | Natus Vincere | NAVI
      2766 | Aurora | AUR
      745 | MOUZ | MOUZ
      5343 | BetBoom | BB
      631 | FURIA | FURIA
    `,
    matches: `
      18037794 | 2026-10-29T08:00 | Quarterfinal | 7278 | 0-2 | 638 | 638 | 3 | finished
      18041418 | 2026-10-29T10:20 | Quarterfinal | 650 | 2-1 | 765 | 650 | 3 | finished
      18041414 | 2026-10-29T13:25 | Quarterfinal | 2766 | 0-2 | 745 | 745 | 3 | finished
      18041411 | 2026-10-29T15:20 | Quarterfinal | 5343 | 0-2 | 631 | 631 | 3 | finished
      18041405 | 2026-10-30T12:00 | Semifinal | 638 | 2-0 | 650 | 638 | 3 | finished
      18041402 | 2026-10-30T15:00 | Semifinal | 745 | 1-2 | 631 | 631 | 3 | finished
      18041397 | 2026-10-31T11:00 | Grand final | 638 | 2-3 | 631 | 631 | 5 | finished
    `,
  },
  // The third-place series, a stage of its own, played before the final.
  bucharestDecider: {
    game: 'cs',
    tournament: { id: 18615, name: 'PGL Masters Bucharest 2026', tier: 's' },
    stage: {
      id: 9682,
      name: 'PGL Masters Bucharest 2026 Decider',
      stage_type: 'playoff',
      stage_order: 3,
      rounds_count: 1,
    },
    teams: `
      650 | Vitality | VIT
      745 | MOUZ | MOUZ
    `,
    matches: `
      18041399 | 2026-10-31T08:00 | 3rd place | 650 | 0-2 | 745 | 745 | 3 | finished
    `,
  },
  // CS2 double elimination with upper and lower lanes.
  starladderPlayoffs: {
    game: 'cs',
    tournament: {
      id: 2691,
      name: 'StarLadder StarSeries Fall 2026',
      tier: 's',
    },
    stage: {
      id: 9260,
      name: 'StarLadder StarSeries Fall 2026 Playoffs',
      stage_type: 'playoff',
      stage_order: 1,
      rounds_count: 8,
    },
    teams: `
      745 | MOUZ | MOUZ
      732 | NRG | NRG
      650 | Vitality | VIT
      7783 | magic | MGC
      765 | Natus Vincere | NAVI
      2766 | Aurora | AUR
      631 | FURIA | FURIA
      735 | MIBR | MIBR
    `,
    matches: `
      15653485 | 2026-09-17T10:00 | Upper bracket quarterfinal | 745 | 1-2 | 732 | 732 | 3 | finished
      15653466 | 2026-09-17T13:10 | Upper bracket quarterfinal | 650 | 2-0 | 7783 | 650 | 3 | finished
      15653449 | 2026-09-17T15:00 | Upper bracket quarterfinal | 765 | 0-2 | 2766 | 2766 | 3 | finished
      15653441 | 2026-09-17T17:15 | Upper bracket quarterfinal | 631 | 2-1 | 735 | 631 | 3 | finished
      15653429 | 2026-09-18T10:00 | Lower bracket round 1 | 745 | 2-1 | 765 | 745 | 3 | finished
      15653418 | 2026-09-18T13:10 | Lower bracket round 1 | 7783 | 1-2 | 735 | 735 | 3 | finished
      15653403 | 2026-09-18T16:10 | Upper bracket semifinal | 732 | 0-2 | 2766 | 2766 | 3 | finished
      15653395 | 2026-09-18T18:40 | Upper bracket semifinal | 650 | 2-0 | 631 | 650 | 3 | finished
      15653377 | 2026-09-19T10:00 | Lower bracket quarterfinal | 732 | 0-2 | 735 | 735 | 3 | finished
      15653387 | 2026-09-19T12:00 | Lower bracket quarterfinal | 631 | 2-1 | 745 | 631 | 3 | finished
      15653364 | 2026-09-19T15:30 | Upper bracket final | 650 | 1-2 | 2766 | 2766 | 3 | finished
      15653359 | 2026-09-19T18:30 | Lower bracket semifinal | 735 | 0-2 | 631 | 631 | 3 | finished
      15653352 | 2026-09-20T12:00 | Lower bracket final | 650 | 2-0 | 631 | 650 | 3 | finished
      15653347 | 2026-09-20T15:00 | Grand final | 2766 | 1-3 | 650 | 650 | 5 | finished
    `,
  },
  // CS2 GSL group.
  thunderpickGroupA: {
    game: 'cs',
    tournament: {
      id: 2693,
      name: 'Thunderpick World Championship 2026',
      tier: 's',
    },
    stage: {
      id: 9265,
      name: 'Thunderpick World Championship 2026 Group A',
      stage_type: 'group',
      stage_order: 1,
      rounds_count: 4,
    },
    teams: `
      316 | 9z | 9z
      2766 | Aurora | AUR
      2018 | Falcons | FLC
      763 | Ninjas in Pyjamas | NIP
    `,
    matches: `
      17665206 | 2026-10-14T09:00 | Opening matches | 316 | 2-0 | 2766 | 316 | 3 | finished
      17665201 | 2026-10-14T12:20 | Opening matches | 2018 | 2-0 | 763 | 2018 | 3 | finished
      17665176 | 2026-10-15T08:30 | Elimination match | 2766 | 2-0 | 763 | 2766 | 3 | finished
      17665181 | 2026-10-15T11:30 | Winners' match | 316 | 1-2 | 2018 | 2018 | 3 | finished
      17665155 | 2026-10-16T14:10 | Decider match | 2766 | 2-0 | 316 | 2766 | 3 | finished
    `,
  },
  // Single elimination with its third-place series in the same stage.
  odysseyPlayoffs: {
    game: 'cs',
    tournament: { id: 2408, name: 'Odyssey Cup Brazil 2025', tier: 'b' },
    stage: {
      id: 8565,
      name: 'Odyssey Cup 2025 Playoffs',
      stage_type: 'playoff',
      stage_order: 2,
      rounds_count: 4,
    },
    teams: `
      4261 | Swingers | SWING
      4443 | Flamengo | FLA
      566 | W7M | W7M
      6605 | NITRO | -
      728 | Sharks | SHK
      6767 | América | AE
      6207 | 2GAME | -
      541 | RED Canids | RED
    `,
    matches: `
      59947 | 2025-05-23T20:00 | Quarterfinal | 4261 | 0-2 | 4443 | 4443 | 3 | finished
      59948 | 2025-05-24T00:15 | Quarterfinal | 566 | 2-1 | 6605 | 566 | 3 | finished
      59949 | 2025-05-24T20:15 | Quarterfinal | 728 | 2-0 | 6767 | 728 | 3 | finished
      59950 | 2025-05-24T22:40 | Quarterfinal | 6207 | 1-2 | 541 | 541 | 3 | finished
      59983 | 2025-05-25T20:15 | Semifinal | 4443 | 0-2 | 541 | 541 | 3 | finished
      59984 | 2025-05-25T22:29 | Semifinal | 728 | 2-0 | 566 | 728 | 3 | finished
      60033 | 2025-05-29T19:20 | 3rd place | 4443 | 0-2 | 566 | 566 | 3 | finished
      59985 | 2025-06-14T20:25 | Grand final | 541 | 0-3 | 728 | 728 | 5 | finished
    `,
  },
  // Contradictory: sent as stage_type "group" with knockout labels.
  gamersClubPlayoffs: {
    game: 'cs',
    tournament: {
      id: 2479,
      name: 'Gamers Club Liga Série A: June 2025',
      tier: 'c',
    },
    stage: {
      id: 8708,
      name: 'Gamers Club Liga Série A: June 2025 Playoffs',
      stage_type: 'group',
      stage_order: 1,
      rounds_count: 3,
    },
    teams: `
      1248 | Elevate | -
      6133 | Galorys | -
      6733 | GameHunters | -
      1630 | MIBR Academy | MIBR.A
      2271 | LP | -
      6767 | América | AE
      6731 | RED Canids Academy | -
    `,
    matches: `
      60631 | 2025-06-24T22:40 | Quarterfinal | 1248 | 2-1 | 6133 | 1248 | 3 | finished
      60633 | 2025-06-25T19:40 | Quarterfinal | 6733 | 0-2 | 1630 | 1630 | 3 | finished
      60632 | 2025-06-25T22:00 | Quarterfinal | 2271 | 2-1 | 6767 | 2271 | 3 | finished
      60666 | 2025-06-26T19:10 | Semifinal | 6731 | 0-2 | 1248 | 1248 | 3 | finished
      60667 | 2025-06-26T22:07:23 | Semifinal | 2271 | 0-2 | 1630 | 1630 | 3 | finished
      60668 | 2025-06-27T19:51:19 | Grand final | 1248 | 2-1 | 1630 | 1248 | 3 | finished
    `,
  },
  // Round labels outside the known vocabulary.
  nodwinPlayIn: {
    game: 'cs',
    tournament: {
      id: 287647,
      name: 'NODWIN Clutch Series 11 Play-In',
      tier: 'c',
    },
    stage: {
      id: 40702,
      name: 'NODWIN Clutch Series 11 Play-In Play-In',
      stage_type: 'playoff',
      stage_order: 5,
      rounds_count: 1,
    },
    teams: `
      31105 | Inner Circle Academy | -
      1376 | MOUZ NXT | MOUZ.N
      5871 | HYPERSPIRIT | HS
      4103 | Permitta | PERM
      6579 | Enjoy | ENJOY
      7764 | ex-Zero Tenacity | -
      1214 | Honvéd | -
      7270 | Bushido Wildcats | BW
    `,
    matches: `
      14065618 | 2026-08-19T08:00 | Qualification | 31105 | 2-1 | 1376 | 31105 | 3 | finished
      14065612 | 2026-08-19T11:10 | Qualification | 5871 | 2-1 | 4103 | 5871 | 3 | finished
      14065602 | 2026-08-19T14:00 | Qualification | 6579 | 0-2 | 7764 | 7764 | 3 | finished
      14065590 | 2026-08-19T17:00 | Qualification | 1214 | 2-1 | 7270 | 1214 | 3 | finished
    `,
  },
  // Excerpt. Earlier captures sent this stage as "group", later ones as "swiss". Round 1 has a forfeit.
  cctGroupStage: {
    game: 'cs',
    tournament: { id: 73621, name: 'CCT Europe 2026 Series 15', tier: 'b' },
    stage: {
      id: 46698,
      name: 'CCT Europe 2026 Series 15 Group Stage',
      stage_type: 'swiss',
      stage_order: 1,
      rounds_count: 5,
    },
    teams: `
      46064 | ex-ENCE | -
      4841 | Leo | L&G
      81323 | Butterfly | BTF
      114821 | Lunacy | LT
      109239 | Aces | ACES
      79019 | MAYBE | MB
      6107 | aimclub | -
      72608 | Noir Verse | -
      6467 | FORZE Reload | FORZE.R
      32913 | Drama | DRAMA
      117628 | Hype Tech | HT
      110818 | XMETA | XMETA
    `,
    matches: `
      19987690 | 2026-11-25T09:00 | Round 1 | 46064 | 0-1 | 4841 | 4841 | 1 | defwin
      19987687 | 2026-11-25T12:20 | Round 1 | 81323 | 1-2 | 114821 | 114821 | 3 | finished
      19987678 | 2026-11-25T15:40 | Round 1 | 109239 | 2-0 | 79019 | 109239 | 3 | finished
      19987685 | 2026-11-25T18:00 | Round 1 | 6107 | 2-1 | 72608 | 6107 | 3 | finished
      19987686 | 2026-11-26T09:00 | - | 6467 | 0-0 | 32913 | - | 3 | upcoming
      19987673 | 2026-11-26T12:00 | - | 117628 | 0-0 | 110818 | - | 3 | upcoming
      19987668 | 2026-11-27T09:00 | - | - | - | - | - | 3 | upcoming
      19987666 | 2026-11-27T12:00 | - | - | - | - | - | 3 | upcoming
    `,
  },
  // Excerpt. CYBERSHOKE reached the quarterfinal through a forfeit.
  provingGrounds: {
    game: 'cs',
    tournament: { id: 2500, name: 'The Proving Grounds Season 3', tier: 'b' },
    stage: {
      id: 8753,
      name: 'The Proving Grounds Season 3 Playoffs',
      stage_type: 'playoff',
      stage_order: 2,
      rounds_count: 4,
    },
    teams: `
      6376 | TNL | -
      483 | 9INE | 9INE
      5459 | Passion UA | PSSN.UA
      5279 | CYBERSHOKE | CS
    `,
    matches: `
      61873 | 2025-08-19T08:00 | Round 1 | 6376 | 2-1 | 483 | 6376 | 3 | finished
      61876 | 2025-08-20T13:00 | Round 1 | 5459 | 0-1 | 5279 | 5279 | 1 | defwin
      61884 | 2025-08-21T17:00 | Quarterfinal | 6376 | 2-0 | 5279 | 6376 | 3 | finished
    `,
  },
  // Valorant Swiss stage, known only by its name.
  vctEuropeSwiss: {
    game: 'valorant',
    tournament: {
      id: 1256398,
      name: 'VCT 2027: EMEA Kickoff: Europe - Qualifier Playoffs',
    },
    stage: {
      id: 111440,
      name: 'VCT 2027: EMEA Kickoff: Europe - Qualifier Playoffs Swiss Stage',
    },
    teams: `
      4107 | NAVI Junior | NAVI.J
      3336012 | Aurora Gaming | -
      489 | Mandatory | MDR
      2660 | Barça eSports | BAR
      804 | UCAM Esports Club | UCAM
      513 | CGN Esports | CGN
      2629 | GIANTX | GX
      3305 | Pixel Lumina | PL
      386 | Enterprise Esports | EP
      3344086 | xXxMasterProMegaTeamxXx | -
      3407 | MIR | MIR
      3411 | la Masia | -
      2672 | Eintracht Frankfurt | SGE
      3421 | F9 EICAR | F9
      174 | Joblife | JL
      3529 | WIP Esports | WIP
    `,
    matches: `
      1557398 | 2026-11-25T16:00 | 6 | 4107 | 2-1 | 3336012 | 4107 | - | finished
      1557399 | 2026-11-25T16:00 | 7 | 489 | 0-2 | 2660 | 2660 | - | finished
      1557400 | 2026-11-25T16:00 | 5 | 804 | 2-1 | 513 | 804 | - | finished
      1557401 | 2026-11-25T16:00 | 8 | 2629 | 2-0 | 3305 | 2629 | - | finished
      1557403 | 2026-11-25T18:30 | 4 | 386 | 2-0 | 3344086 | 386 | - | finished
      1557405 | 2026-11-25T18:50 | 3 | 3407 | 1-2 | 3411 | 3411 | - | finished
      1557406 | 2026-11-25T18:50 | 2 | 2672 | 2-1 | 3421 | 2672 | - | finished
      1557404 | 2026-11-25T19:25 | 1 | 174 | 2-0 | 3529 | 174 | - | finished
      1614079 | 2026-11-26T16:00 | - | 386 | 0-0 | 804 | - | - | upcoming
      1614080 | 2026-11-26T16:00 | - | 2672 | 0-0 | 2629 | - | - | upcoming
      1614081 | 2026-11-26T16:00 | - | 4107 | 0-0 | 2660 | - | - | upcoming
      1614082 | 2026-11-26T16:00 | - | 174 | 0-0 | 3411 | - | - | upcoming
      1614085 | 2026-11-26T18:30 | - | 513 | 0-0 | 3344086 | - | - | upcoming
      1614086 | 2026-11-26T18:30 | - | 3336012 | 0-0 | 3529 | - | - | upcoming
      1614088 | 2026-11-26T18:30 | - | 489 | 0-0 | 3407 | - | - | upcoming
      1614089 | 2026-11-26T18:30 | - | 3305 | 0-0 | 3421 | - | - | upcoming
    `,
  },
  // Valorant group, known only by its name.
  vctTurkiyeGroupA: {
    game: 'valorant',
    tournament: {
      id: 1700656,
      name: 'VCT 2027: EMEA Kickoff: Türkiye - Qualifier Playoffs',
    },
    stage: {
      id: 111185,
      name: 'VCT 2027: EMEA Kickoff: Türkiye - Qualifier Playoffs Group A',
    },
    teams: `
      652 | Eternal Fire | EF
      2555 | Misa Esports | -
      761 | Fire Flux Esports | FF
      2334728 | Trigon Titans | TT
    `,
    matches: `
      1551766 | 2026-11-24T14:30 | 2 | 652 | 2-0 | 2555 | 652 | - | finished
      1551767 | 2026-11-24T16:50 | 1 | 761 | 0-2 | 2334728 | 2334728 | - | finished
      1585250 | 2026-11-26T14:30 | 4 | 652 | 0-0 | 2334728 | - | - | upcoming
      1585272 | 2026-11-29T14:30 | 2 | 2555 | 0-0 | 761 | - | - | upcoming
      1585282 | 2026-11-30T14:30 | 1 | - | - | - | - | - | upcoming
    `,
  },
  // Valorant playoff. tournament_stages sends format "playoff", sequence 1.
  vctEuropePlayoffs: {
    game: 'valorant',
    tournament: {
      id: 1427202,
      name: 'VCT 2027: EMEA Kickoff: Europe - Qualifier 1',
    },
    stage: {
      id: 97960,
      name: 'VCT 2027: EMEA Kickoff: Europe - Qualifier 1 Playoffs',
    },
    teams: `
      3336012 | Aurora Gaming | -
      3305 | Pixel Lumina | PL
      3344086 | xXxMasterProMegaTeamxXx | -
      3421 | F9 EICAR | F9
    `,
    matches: `
      1295875 | 2026-11-10T16:00 | 3 | 3336012 | 2-0 | 3305 | 3336012 | - | finished
      1295876 | 2026-11-10T16:00 | 2 | 3344086 | 1-2 | 3421 | 3421 | - | finished
      1295880 | 2026-11-10T18:45 | 1 | 3421 | 1-2 | 3336012 | 3336012 | - | finished
    `,
  },
  // League of Legends sends no stage or round.
  lcsPromotion: {
    game: 'lol',
    tournament: {
      id: 106226,
      name: 'LCS 2027 Promotion Tournament',
      tier: 's',
    },
    stage: null,
    teams: `
      86 | Disguised | -
      80 | Maryville University | -
      3390 | Cupid Esports | -
      74 | Fuego | -
    `,
    matches: `
      2378571 | 2026-10-07T21:00 | - | 86 | 1-3 | 80 | 80 | 5 | finished
      2378570 | 2026-10-08T21:00 | - | 3390 | 0-3 | 80 | 80 | 5 | finished
      2378569 | 2026-10-09T23:00 | - | 74 | 0-3 | 86 | 86 | 5 | finished
      2378567 | 2026-10-10T21:00 | - | 3390 | 0-3 | 86 | 86 | 5 | finished
      2378564 | 2026-10-12T23:00 | - | 80 | 0-3 | 86 | 86 | 5 | finished
    `,
  },
  // Excerpt. Dota 2 best-of-2 series: a 1-1 tie, a 2-0 and a 0-2.
  ewcDota: {
    game: 'dota',
    tournament: { id: 46174, name: 'Esports World Cup 2026', tier: 's' },
    stage: null,
    teams: `
      9 | PARIVISION | -
      2 | Team Spirit | -
      13 | LGD Gaming | -
      281 | Inner Circle x Insanity | -
      7 | OG | -
      11 | Virtus.pro | -
    `,
    matches: `
      701208 | 2026-07-12T09:10 | - | 9 | 1-1 | 2 | - | 2 | finished
      701205 | 2026-07-12T12:00 | - | 13 | 2-0 | 281 | 13 | 2 | finished
      701206 | 2026-07-12T12:15 | - | 7 | 0-2 | 11 | 11 | 2 | finished
    `,
  },
} satisfies Record<string, RecordedStage>
