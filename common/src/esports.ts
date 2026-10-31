import { sortBy } from 'lodash'

// ─── Esports ──────────────────────────────────────────────────────────────────
//
// Esports sit beside the sports on /sports as a world of their own. Each game
// is its own sport (League of Legends, VALORANT, CS2…), and the unit is a
// tournament with stages and brackets rather than a season of fixtures.
//
// There's no esports data feed. The community runs each big tournament as a
// match megamarket: one answer per series ("HLE defeats BLG (Bo3)"), added
// round by round and resolved YES or NO as each series ends. This file reads
// those answers into series, Swiss records, brackets and champions. Only
// settled YES/NO results move a record: prices never decide who is out.
//
// The tournaments are plain data checked into the repo, like the sports
// calendar: adding one is a short PR naming its markets and teams.

export type EsportsTitleKey = 'lol' | 'valorant' | 'cs2' | 'dota2' | 'smash'

export interface EsportsTitle {
  key: EsportsTitleKey
  name: string
  /** On chips and cards. */
  short: string
  /** One to three letters for the game's mark. */
  mark: string
  /** The game's brand colour, for its mark. */
  color: string
  /** Prod topics that hold the game's markets: its Markets tab. */
  groupIds: string[]
  /** The main topic, for "see all" links into /browse. */
  slug: string
}

export const ESPORTS_TITLES: EsportsTitle[] = [
  {
    key: 'lol',
    name: 'League of Legends',
    short: 'LoL',
    mark: 'LoL',
    color: '#C89B3C',
    groupIds: [
      '0SkUfk47dKNXXscUS87T', // league-of-legends
      'f2e23064-eb7f-470f-825a-0b4115f9566e', // lol-worlds-2023
    ],
    slug: 'league-of-legends',
  },
  {
    key: 'valorant',
    name: 'VALORANT',
    short: 'VALORANT',
    mark: 'V',
    color: '#FF4655',
    groupIds: ['2fa3a169-96f2-4410-9b52-b77deffb4e40'], // valorant
    slug: 'valorant',
  },
  {
    key: 'cs2',
    name: 'Counter-Strike 2',
    short: 'CS2',
    mark: 'CS',
    color: '#DE9B35',
    groupIds: [
      'kkBzSl72Ah1wuZoFkSFJ', // counterstrike
      '74d52eea-f326-428e-ad50-81d5396b2ebe', // cs2
    ],
    slug: 'counterstrike',
  },
  {
    key: 'dota2',
    name: 'Dota 2',
    short: 'Dota 2',
    mark: 'D2',
    color: '#D3402C',
    groupIds: ['knyIzWI8Wb2zaGLCYmTd'], // dota-2
    slug: 'dota-2',
  },
  {
    key: 'smash',
    name: 'Super Smash Bros.',
    short: 'Smash',
    mark: 'SSB',
    color: '#E60012',
    groupIds: [
      'koeOcecc6M4mnd83iBbb', // super-smash-bros-melee
      'pukhd11nYyEVmGX2uLSk', // super-smash-bros-series
    ],
    slug: 'super-smash-bros-melee',
  },
]

export const ESPORTS_TITLE_BY_KEY = Object.fromEntries(
  ESPORTS_TITLES.map((t) => [t.key, t])
) as Record<EsportsTitleKey, EsportsTitle>

export const isEsportsTitleKey = (key: string): key is EsportsTitleKey =>
  Object.prototype.hasOwnProperty.call(ESPORTS_TITLE_BY_KEY, key)

/** The sports index's key for the Esports topic: it opens the esports world. */
export const ESPORTS_SPORT_KEY = 'esports'

export const esportsPath = (title?: EsportsTitleKey) =>
  title ? `/sports/esports/${title}` : '/sports/esports'

// ─── Tournaments ──────────────────────────────────────────────────────────────

export interface EsportsTeam {
  /** The short code broadcasts use: "HLE", "T1". */
  code: string
  name: string
  /** Other spellings markets use: "Gen. G", "Team Liquid Alienware". */
  aliases?: string[]
}

export type EsportsStage =
  | {
      kind: 'swiss'
      key: string
      name: string
      /** Every team in the stage, by code: who can be paired. */
      teams: string[]
      /** Wins that send a team through, and losses that send it home. */
      advanceAt: number
      eliminateAt: number
      /** Where the teams that make it go ("the quarterfinals"). */
      advanceTo: string
    }
  | {
      kind: 'bracket'
      key: string
      name: string
      /** Single elimination: the rounds in order, the last is the final. */
      rounds: string[]
      /** Usually the last stage's survivors; filled in as they're decided. */
      size: number
    }
  | {
      /** A stage told only through its answers' own labels ("[UBR1-1]"). */
      kind: 'labelled'
      key: string
      name: string
    }

export interface EsportsEvent {
  key: string
  title: EsportsTitleKey
  name: string
  longName: string
  /** Rough window, for ordering and "this autumn" copy; never shown as a fixture time. */
  startDate: string
  endDate: string
  stages: EsportsStage[]
  /**
   * Match megamarkets, each feeding the stages it holds. A Swiss stage
   * takes series until every team is through or out; the bracket after it
   * takes the rest.
   */
  matchMarkets: { id: string; stages: string[] }[]
  /** "Who will win …": the title odds. */
  winnerMarketId?: string
  /** Other markets on the event worth a row: props, side bets. */
  sideMarketIds?: string[]
  teams: EsportsTeam[]
}

const WORLDS_2026_TEAMS: EsportsTeam[] = [
  { code: 'GEN', name: 'Gen.G', aliases: ['Gen. G', 'GenG'] },
  { code: 'HLE', name: 'Hanwha Life Esports', aliases: ['Hanwha Life'] },
  { code: 'T1', name: 'T1' },
  { code: 'DK', name: 'Dplus KIA', aliases: ['Dplus'] },
  { code: 'BLG', name: 'Bilibili Gaming' },
  { code: 'TES', name: 'Top Esports' },
  { code: 'AL', name: "Anyone's Legend" },
  { code: 'IG', name: 'Invictus Gaming' },
  { code: 'G2', name: 'G2 Esports' },
  { code: 'MKOI', name: 'Movistar KOI' },
  { code: 'KC', name: 'Karmine Corp' },
  { code: 'TL', name: 'Team Liquid', aliases: ['Team Liquid Alienware'] },
  { code: 'LYON', name: 'LYON' },
  { code: 'LOS', name: 'Los Grandes' },
  { code: 'CFO', name: 'CTBC Flying Oyster' },
  { code: 'TSW', name: 'Team Secret Whales' },
  { code: 'MVK', name: 'MVK Esports' },
  { code: 'C9', name: 'Cloud9', aliases: ['Cloud9 KIA'] },
  { code: 'FUR', name: 'FURIA' },
]

export const ESPORTS_EVENTS: EsportsEvent[] = [
  {
    key: 'lol-worlds-2026',
    title: 'lol',
    name: 'Worlds 2026',
    longName: 'League of Legends World Championship 2026',
    startDate: '2026-10-11',
    endDate: '2026-11-15',
    stages: [
      { kind: 'labelled', key: 'play-in', name: 'Play-In' },
      {
        kind: 'swiss',
        key: 'swiss',
        name: 'Swiss Stage',
        teams: [
          'GEN',
          'HLE',
          'T1',
          'DK',
          'BLG',
          'TES',
          'AL',
          'IG',
          'G2',
          'MKOI',
          'KC',
          'TL',
          'LYON',
          'LOS',
          'CFO',
          'TSW',
        ],
        advanceAt: 3,
        eliminateAt: 3,
        advanceTo: 'the quarterfinals',
      },
      {
        kind: 'bracket',
        key: 'knockouts',
        name: 'Knockouts',
        rounds: ['Quarterfinals', 'Semifinals', 'Final'],
        size: 8,
      },
    ],
    matchMarkets: [
      { id: '8CNt8EuP5P', stages: ['play-in'] },
      { id: 'ynAsZLIl50', stages: ['swiss', 'knockouts'] },
    ],
    winnerMarketId: 'td8NIdpz9N',
    sideMarketIds: ['NIl5pO68nC', 'sC6cPEn0dZ', 'QI5ISdhOPy'],
    teams: WORLDS_2026_TEAMS,
  },
  {
    key: 'cs2-pgl-singapore-2026',
    title: 'cs2',
    name: 'PGL Singapore Major',
    longName: 'Counter-Strike 2 PGL Singapore Major 2026',
    startDate: '2026-11-28',
    endDate: '2026-12-13',
    stages: [],
    matchMarkets: [],
    winnerMarketId: 'tELgt2Edz9',
    teams: [
      { code: 'VIT', name: 'Vitality', aliases: ['Team Vitality'] },
      { code: 'SPIRIT', name: 'Spirit', aliases: ['Team Spirit'] },
      { code: 'FAL', name: 'Falcons', aliases: ['Team Falcons'] },
    ],
  },
  {
    key: 'val-champions-2026',
    title: 'valorant',
    name: 'Champions Shanghai',
    longName: 'VALORANT Champions Shanghai 2026',
    startDate: '2026-09-23',
    endDate: '2026-10-17',
    stages: [{ kind: 'labelled', key: 'main', name: 'Groups & Playoffs' }],
    matchMarkets: [{ id: 'stIyIP660t', stages: ['main'] }],
    sideMarketIds: ['dzz8cZqZnU'],
    teams: [
      { code: 'LOUD', name: 'LOUD' },
      { code: 'VIT', name: 'Team Vitality', aliases: ['Vitality'] },
      { code: '100T', name: '100 Thieves' },
      { code: 'G2', name: 'G2 Esports' },
      { code: 'NRG', name: 'NRG' },
      { code: 'PRX', name: 'Paper Rex' },
      { code: 'T1', name: 'T1' },
      { code: 'TL', name: 'Team Liquid' },
      { code: 'TYL', name: 'TYLOO' },
      { code: 'NS', name: 'Nongshim RedForce' },
      { code: 'KC', name: 'Karmine Corp' },
      { code: 'XLG', name: 'Xi Lai Gaming' },
      { code: 'GE', name: 'Global Esports' },
      { code: 'EDG', name: 'EDward Gaming' },
      { code: 'JDG', name: 'JD Gaming' },
      { code: 'FUT', name: 'FUT Esports' },
    ],
  },
  {
    key: 'dota-ti-2026',
    title: 'dota2',
    name: 'The International',
    longName: 'Dota 2 The International 2026',
    startDate: '2026-08-08',
    endDate: '2026-08-22',
    stages: [],
    matchMarkets: [],
    winnerMarketId: '2nl5I6cN66',
    teams: [
      { code: 'TS', name: 'Team Spirit' },
      { code: 'TL', name: 'Team Liquid' },
      { code: 'FLC', name: 'Team Falcons' },
    ],
  },
  {
    key: 'melee-rankings-2026',
    title: 'smash',
    name: 'Melee Rankings 2026',
    longName: 'Super Smash Bros. Melee 2026 year-end #1',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    stages: [],
    matchMarkets: [],
    winnerMarketId: '952PSCl2Py',
    teams: [],
  },
]

/** Every market the esports pages read, deduplicated. */
export function esportsMarketIds(events = ESPORTS_EVENTS): string[] {
  const ids = events.flatMap((e) => [
    ...e.matchMarkets.map((m) => m.id),
    ...(e.winnerMarketId ? [e.winnerMarketId] : []),
    ...(e.sideMarketIds ?? []),
  ])
  return [...new Set(ids)]
}

// ─── Reading series out of answers ────────────────────────────────────────────

/** What an answer needs to be read as a series. */
export interface SeriesAnswer {
  id: string
  index: number
  text: string
  prob: number
  volume: number
  createdTime: number
  resolution?: string
  resolutionTime?: number
}

export interface ParsedSeries {
  /** "A defeats B": the answer is YES when A wins. */
  a: string
  b: string
  bestOf?: number
  /** The answer's own stage label: "UBR1-1", "Winner's Round 2", "GF". */
  label?: string
}

const SERIES_VERB_RE = /\s+(?:defeats|beats|def\.)\s+/i

/**
 * "HLE defeats BLG (Bo3)", "[UBR1-1] NRG beats T1",
 * "Winner's Round 2 - MVK Esports defeats Karmine Corp" → the two sides.
 * Anything else (a prop, "A vs B" with no winner named) isn't a series.
 */
export function parseSeriesAnswer(text: string): ParsedSeries | undefined {
  let rest = text.trim()
  let bestOf: number | undefined
  // Trailing notes: "(Bo3)", "(L)".
  for (;;) {
    const note = rest.match(/\s*\(([^()]*)\)\s*$/)
    if (!note) break
    const bo = note[1].trim().match(/^bo\s*(\d)$/i)
    if (bo) bestOf = Number(bo[1])
    rest = rest.slice(0, note.index).trim()
  }
  const labels: string[] = []
  const tag = rest.match(/^\[([^\]]+)\]\s*/)
  if (tag) {
    labels.push(tag[1].trim())
    rest = rest.slice(tag[0].length)
  }
  const prefix = rest.match(/^(.+?)\s+-\s+(?=.+\s(?:defeats|beats|def\.)\s)/i)
  if (prefix) {
    labels.push(prefix[1].trim())
    rest = rest.slice(prefix[0].length)
  }
  const parts = rest.split(SERIES_VERB_RE)
  if (parts.length !== 2) return undefined
  const [a, b] = parts.map((p) => p.trim())
  if (!a || !b || norm(a) === norm(b)) return undefined
  return { a, b, bestOf, label: labels.join(' · ') || undefined }
}

const norm = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/** A side of a series: a known team of the event, or a name we can't place. */
export interface TeamRef {
  code: string
  name: string
  known: boolean
}

export function teamLookup(teams: EsportsTeam[]) {
  const byKey = new Map<string, EsportsTeam>()
  for (const t of teams) {
    for (const k of [t.code, t.name, ...(t.aliases ?? [])])
      byKey.set(norm(k), t)
  }
  return (name: string): TeamRef => {
    const team = byKey.get(norm(name))
    if (team) return { code: team.code, name: team.name, known: true }
    const words = name.trim().split(/\s+/)
    const code =
      words.length === 1
        ? words[0].slice(0, 4).toUpperCase()
        : words
            .map((w) => w[0])
            .join('')
            .slice(0, 4)
            .toUpperCase()
    return { code, name: name.trim(), known: false }
  }
}

export type SeriesStatus =
  /** Trading: the answer is unresolved and the market is open. */
  | 'open'
  /** The market closed with the answer unresolved: awaiting a result. */
  | 'awaiting'
  /** Resolved YES or NO: a winner. */
  | 'final'
  /** Cancelled, or resolved to a percentage: no winner to count. */
  | 'void'

export interface EsportsSeries {
  contractId: string
  answerId: string
  index: number
  text: string
  a: TeamRef
  b: TeamRef
  bestOf?: number
  label?: string
  /** The chance A wins: the answer's probability. */
  prob: number
  volume: number
  status: SeriesStatus
  winner?: 'a' | 'b'
  createdTime: number
  resolvedTime?: number
}

/** Every series in a match market, in the order they were added. */
export function readSeries(
  contract: { id: string; closeTime?: number; isResolved?: boolean },
  answers: SeriesAnswer[],
  teams: EsportsTeam[],
  now = Date.now()
): { series: EsportsSeries[]; unread: SeriesAnswer[] } {
  const lookup = teamLookup(teams)
  const closed =
    !!contract.isResolved ||
    (contract.closeTime != null && contract.closeTime <= now)
  const series: EsportsSeries[] = []
  const unread: SeriesAnswer[] = []
  for (const answer of sortBy(answers, 'index')) {
    const parsed = parseSeriesAnswer(answer.text)
    if (!parsed) {
      unread.push(answer)
      continue
    }
    const { resolution } = answer
    const status: SeriesStatus =
      resolution === 'YES' || resolution === 'NO'
        ? 'final'
        : resolution
        ? 'void'
        : closed
        ? 'awaiting'
        : 'open'
    series.push({
      contractId: contract.id,
      answerId: answer.id,
      index: answer.index,
      text: answer.text,
      a: lookup(parsed.a),
      b: lookup(parsed.b),
      bestOf: parsed.bestOf,
      label: parsed.label,
      prob: Number.isFinite(answer.prob) ? answer.prob : 0.5,
      volume: Number.isFinite(answer.volume) ? answer.volume : 0,
      status,
      winner:
        resolution === 'YES' ? 'a' : resolution === 'NO' ? 'b' : undefined,
      createdTime: answer.createdTime,
      resolvedTime: answer.resolutionTime,
    })
  }
  return { series, unread }
}

/** The chance side `side` wins the series. */
export const sideProb = (s: Pick<EsportsSeries, 'prob'>, side: 'a' | 'b') =>
  side === 'a' ? s.prob : 1 - s.prob

// ─── Swiss ────────────────────────────────────────────────────────────────────

export interface SwissRecord {
  team: TeamRef
  wins: number
  losses: number
  status: 'through' | 'out' | 'alive'
  /** Results in the order they were played. */
  results: ('W' | 'L')[]
}

export type SwissStakes =
  /** Both a win from going through and a loss from going home. */
  | 'decider'
  /** The winner goes through. */
  | 'qualification'
  /** The loser goes home. */
  | 'elimination'
  | 'regular'

export interface SwissPairing {
  series: EsportsSeries
  round: number
  recordA: { wins: number; losses: number }
  recordB: { wins: number; losses: number }
  stakes: SwissStakes
}

export interface SwissStandings {
  records: SwissRecord[]
  /** Series still to be settled (open or awaiting), with what rides on each. */
  pending: SwissPairing[]
  /** The round being played: every team still in has played one fewer. */
  round: number
  /** Every team is through or out. */
  complete: boolean
  /** The series this stage took, so the next stage can skip them. */
  taken: Set<string>
  /**
   * What didn't add up: an unknown team, a team paired twice in one round,
   * a pairing of teams on different records. Shown as a coverage note; the
   * records above still only count settled results.
   */
  problems: string[]
}

/**
 * Records from settled series, in the order the market added them. A series
 * belongs to the stage while both teams are still in it, so the bracket's
 * series that follow in the same market are left for the bracket.
 */
export function buildSwiss(
  stage: Extract<EsportsStage, { kind: 'swiss' }>,
  series: EsportsSeries[],
  teams: EsportsTeam[]
): SwissStandings {
  const lookup = teamLookup(teams)
  const records = new Map<string, SwissRecord>(
    stage.teams.map((code) => [
      code,
      {
        team: lookup(code),
        wins: 0,
        losses: 0,
        status: 'alive',
        results: [],
      },
    ])
  )
  const problems: string[] = []
  const pending: SwissPairing[] = []
  const taken = new Set<string>()
  const busy = new Set<string>()
  const stillIn = (r: SwissRecord | undefined) => !!r && r.status === 'alive'

  for (const s of series) {
    if (s.status === 'void') continue
    // An answer that names a knockout round belongs to the bracket, wherever
    // it sits in the list (a placeholder added early and edited later).
    if (s.label && KNOCKOUT_LABEL_RE.test(s.label)) continue
    const ra = records.get(s.a.code)
    const rb = records.get(s.b.code)
    if (!ra || !rb) {
      // A bracket series once the stage is over; before that, a typo or a
      // team we don't know.
      if (!completeOf(records)) problems.push(`Can't place "${s.text}"`)
      continue
    }
    if (!stillIn(ra) || !stillIn(rb)) continue
    taken.add(s.answerId)
    const playedA = ra.wins + ra.losses
    const playedB = rb.wins + rb.losses
    if (playedA !== playedB)
      problems.push(`"${s.text}" pairs teams on different rounds`)
    const recordA = { wins: ra.wins, losses: ra.losses }
    const recordB = { wins: rb.wins, losses: rb.losses }
    if (s.status === 'final') {
      const [w, l] = s.winner === 'a' ? [ra, rb] : [rb, ra]
      w.wins++
      w.results.push('W')
      l.losses++
      l.results.push('L')
      if (w.wins >= stage.advanceAt) w.status = 'through'
      if (l.losses >= stage.eliminateAt) l.status = 'out'
      continue
    }
    for (const code of [s.a.code, s.b.code]) {
      if (busy.has(code)) problems.push(`${code} has two open series`)
      busy.add(code)
    }
    const winsThrough =
      recordA.wins === stage.advanceAt - 1 &&
      recordB.wins === stage.advanceAt - 1
    const lossOut =
      recordA.losses === stage.eliminateAt - 1 &&
      recordB.losses === stage.eliminateAt - 1
    pending.push({
      series: s,
      round: Math.max(playedA, playedB) + 1,
      recordA,
      recordB,
      stakes:
        winsThrough && lossOut
          ? 'decider'
          : winsThrough
          ? 'qualification'
          : lossOut
          ? 'elimination'
          : 'regular',
    })
  }

  const list = [...records.values()]
  const alive = list.filter((r) => r.status === 'alive')
  const round =
    alive.length === 0
      ? 0
      : Math.min(...alive.map((r) => r.wins + r.losses)) + 1
  return {
    records: sortBy(
      list,
      (r) => -r.wins,
      (r) => r.losses,
      (r) => r.team.code
    ),
    pending,
    round,
    complete: alive.length === 0,
    taken,
    problems,
  }
}

const KNOCKOUT_LABEL_RE = /quarter|semi|final|playoff|bracket|\b(?:qf|sf|gf)\b/i

const completeOf = (records: Map<string, SwissRecord>) =>
  [...records.values()].every((r) => r.status !== 'alive')

/** Records grouped by W–L, best first: the Swiss board's columns. */
export function swissBuckets(records: SwissRecord[]) {
  const buckets = new Map<string, SwissRecord[]>()
  for (const r of records) {
    const key = `${r.wins}-${r.losses}`
    buckets.set(key, [...(buckets.get(key) ?? []), r])
  }
  return sortBy(
    [...buckets.entries()].map(([key, list]) => ({
      key,
      wins: list[0].wins,
      losses: list[0].losses,
      status: list[0].status,
      records: list,
    })),
    // Through first, then by record, then out.
    (b) => (b.status === 'through' ? 0 : b.status === 'alive' ? 1 : 2),
    (b) => -(b.wins - b.losses),
    (b) => -b.wins
  )
}

// ─── Single-elimination bracket ───────────────────────────────────────────────

export interface BracketRound {
  name: string
  series: EsportsSeries[]
  /** Slots still to be drawn. */
  open: number
}

/**
 * The bracket's series by round: a team's round is the number of bracket
 * series it has won, so a series between two teams on one win is a semifinal.
 */
export function buildBracket(
  stage: Extract<EsportsStage, { kind: 'bracket' }>,
  series: EsportsSeries[],
  entrants: Set<string>
): { rounds: BracketRound[]; champion?: TeamRef; problems: string[] } {
  const wins = new Map<string, number>()
  const out = new Set<string>()
  const byRound: EsportsSeries[][] = stage.rounds.map(() => [])
  const problems: string[] = []
  let champion: TeamRef | undefined
  for (const s of series) {
    if (s.status === 'void') continue
    if (!entrants.has(s.a.code) || !entrants.has(s.b.code)) {
      problems.push(`Can't place "${s.text}" in the bracket`)
      continue
    }
    if (out.has(s.a.code) || out.has(s.b.code)) {
      problems.push(`"${s.text}" has a team already out`)
      continue
    }
    const wa = wins.get(s.a.code) ?? 0
    const wb = wins.get(s.b.code) ?? 0
    if (wa !== wb) problems.push(`"${s.text}" pairs teams on different rounds`)
    const round = Math.min(Math.max(wa, wb), stage.rounds.length - 1)
    byRound[round].push(s)
    if (s.status === 'final') {
      const [w, l] = s.winner === 'a' ? [s.a, s.b] : [s.b, s.a]
      wins.set(w.code, round + 1)
      out.add(l.code)
      if (round === stage.rounds.length - 1) champion = w
    }
  }
  let slots = stage.size / 2
  const rounds = stage.rounds.map((name, i) => {
    const r = {
      name,
      series: byRound[i],
      open: Math.max(0, slots - byRound[i].length),
    }
    slots = Math.max(1, slots / 2)
    return r
  })
  return { rounds, champion, problems }
}

// ─── Champions of finished events ─────────────────────────────────────────────

const GRAND_FINAL_RE = /^(?:gf|grand ?final|final)$/i

/**
 * Who won: the winner market's resolved answer, else the winner of a series
 * labelled as the grand final.
 */
export function eventChampion(props: {
  winner?: {
    resolution?: string
    answers: { id: string; text: string; prob: number; resolution?: string }[]
  }
  series?: EsportsSeries[]
}): string | undefined {
  const { winner, series } = props
  if (winner?.resolution) {
    const won =
      winner.answers.find((a) => a.id === winner.resolution) ??
      winner.answers.find((a) => a.resolution === 'YES')
    if (won) return won.text
  }
  const final = grandFinal(series ?? [])
  return final ? (final.winner === 'a' ? final.a : final.b).name : undefined
}

/** The settled series labelled as the grand final, if there is one. */
export function grandFinal(series: EsportsSeries[]) {
  return series.find(
    (s) =>
      s.status === 'final' &&
      !!s.label &&
      s.label.split(' · ').some((l) => GRAND_FINAL_RE.test(l.trim()))
  )
}

// ─── An event as the page shows it ────────────────────────────────────────────

/** What the view needs from a market (a Contract fits). */
export interface EsportsMarketLike {
  id: string
  question?: string
  slug?: string
  creatorUsername?: string
  closeTime?: number
  isResolved?: boolean
  resolution?: string
  volume?: number
  uniqueBettorCount?: number
  answers?: (SeriesAnswer & { isOther?: boolean })[]
}

type SwissStage = Extract<EsportsStage, { kind: 'swiss' }>
type BracketStage = Extract<EsportsStage, { kind: 'bracket' }>

export type TeamStanding = 'champion' | 'through' | 'alive' | 'out' | 'unknown'

/** A team in the title odds, with where it stands in the event. */
export interface OddsRow {
  answerId: string
  text: string
  prob: number
  team?: TeamRef
  isOther: boolean
  standing: TeamStanding
}

export type StageState = 'done' | 'current' | 'next'

export interface EsportsEventView {
  event: EsportsEvent
  title: EsportsTitle
  status: 'in-progress' | 'upcoming' | 'finished'
  stages: { stage: EsportsStage; state: StageState }[]
  swiss?: { stage: SwissStage; standings: SwissStandings }
  bracket?: {
    stage: BracketStage
    rounds: BracketRound[]
    champion?: TeamRef
    /** Teams in it, decided so far. */
    entrants: string[]
  }
  /** Every series read, by stage key. */
  series: Record<string, EsportsSeries[]>
  /** Series still trading: the current stage's first. */
  openSeries: EsportsSeries[]
  /** Records and stakes of the Swiss series still to settle. */
  pairings: Record<string, SwissPairing>
  odds: OddsRow[]
  champion?: string
  /** The settled final of the last stage, to show once the event is over. */
  finalSeries?: EsportsSeries
  problems: string[]
  /** Who made the markets, for the credit line. */
  creators: string[]
  volume: number
  traders: number
}

export function esportsEventView(
  event: EsportsEvent,
  markets: Record<string, EsportsMarketLike | undefined>,
  now = Date.now()
): EsportsEventView {
  const title = ESPORTS_TITLE_BY_KEY[event.title]
  const series: Record<string, EsportsSeries[]> = {}
  const problems: string[] = []
  let swiss: EsportsEventView['swiss']
  let bracket: EsportsEventView['bracket']
  const pairings: Record<string, SwissPairing> = {}

  for (const { id, stages: keys } of event.matchMarkets) {
    const market = markets[id]
    if (!market) continue
    let left = readSeries(market, market.answers ?? [], event.teams, now).series
    for (const key of keys) {
      const stage = event.stages.find((s) => s.key === key)
      if (!stage) continue
      if (stage.kind === 'swiss') {
        const standings = buildSwiss(stage, left, event.teams)
        swiss = { stage, standings }
        series[key] = left.filter((s) => standings.taken.has(s.answerId))
        left = left.filter((s) => !standings.taken.has(s.answerId))
        for (const p of standings.pending) pairings[p.series.answerId] = p
        problems.push(...standings.problems)
      } else if (stage.kind === 'bracket') {
        // Its teams: the Swiss stage's survivors, decided so far.
        const entrants = swiss
          ? swiss.standings.records
              .filter((r) => r.status === 'through')
              .map((r) => r.team.code)
          : event.teams.map((t) => t.code)
        const built = buildBracket(stage, left, new Set(entrants))
        problems.push(...built.problems)
        bracket = {
          stage,
          rounds: built.rounds,
          champion: built.champion,
          entrants,
        }
        series[key] = built.rounds.flatMap((r) => r.series)
        left = []
      } else {
        series[key] = left
        left = []
      }
    }
  }

  const winner = event.winnerMarketId
    ? markets[event.winnerMarketId]
    : undefined
  const allSeries = Object.values(series).flat()
  // Only the last stage's final crowns anyone: a Play-In has a final too.
  const lastStage = event.stages[event.stages.length - 1]
  const finalSeries = !lastStage
    ? undefined
    : lastStage.kind === 'bracket'
    ? bracket?.rounds.at(-1)?.series.find((s) => s.status === 'final')
    : lastStage.kind === 'labelled'
    ? grandFinal(series[lastStage.key] ?? [])
    : undefined
  const champion =
    bracket?.champion?.name ??
    eventChampion({
      winner: winner
        ? { resolution: winner.resolution, answers: winner.answers ?? [] }
        : undefined,
      series:
        lastStage && lastStage.kind === 'labelled'
          ? series[lastStage.key]
          : undefined,
    })

  const ids = esportsMarketIds([event])
  const eventMarkets = ids
    .map((id) => markets[id])
    .filter((m): m is EsportsMarketLike => !!m)
  // A market that didn't load says nothing: every one must be in, and settled.
  const everyMarketSettled =
    ids.length > 0 &&
    eventMarkets.length === ids.length &&
    eventMarkets.every((m) => m.isResolved)
  const status: EsportsEventView['status'] =
    champion || everyMarketSettled
      ? 'finished'
      : now < Date.parse(event.startDate)
      ? 'upcoming'
      : 'in-progress'

  const stageDone = (stage: EsportsStage) => {
    if (status === 'finished') return true
    if (stage.kind === 'swiss') return !!swiss?.standings.complete
    if (stage.kind === 'bracket') return !!bracket?.champion
    const list = series[stage.key] ?? []
    const source = event.matchMarkets.find((m) => m.stages.includes(stage.key))
    const m = source && markets[source.id]
    return (
      list.length > 0 &&
      list.every((s) => s.status === 'final' || s.status === 'void') &&
      !!m &&
      (!!m.isResolved || (m.closeTime ?? Infinity) <= now)
    )
  }
  let reached = false
  const stages = event.stages.map((stage) => {
    if (reached) return { stage, state: 'next' as StageState }
    if (stageDone(stage)) return { stage, state: 'done' as StageState }
    reached = true
    return {
      stage,
      state: (status === 'upcoming' ? 'next' : 'current') as StageState,
    }
  })

  const lookup = teamLookup(event.teams)
  const swissCodes = new Set(swiss?.stage.teams ?? [])
  const swissAt = stages.findIndex((s) => s.stage.kind === 'swiss')
  const beforeSwissDone =
    swissAt >= 0 && stages.slice(0, swissAt).every((s) => s.state === 'done')
  const knockedOut = new Set(
    (bracket?.rounds ?? []).flatMap((r) =>
      r.series
        .filter((s) => s.status === 'final')
        .map((s) => (s.winner === 'a' ? s.b.code : s.a.code))
    )
  )
  const standingOf = (team: TeamRef | undefined): TeamStanding => {
    if (!team) return 'unknown'
    if (champion) return norm(champion) === norm(team.name) ? 'champion' : 'out'
    if (!team.known) return 'unknown'
    if (knockedOut.has(team.code)) return 'out'
    // Without results to read, say nothing about who's still in.
    if (!swiss) return 'unknown'
    // Not in the Swiss stage: out, once the stages before it are over.
    if (!swissCodes.has(team.code)) return beforeSwissDone ? 'out' : 'unknown'
    const r = swiss.standings.records.find((x) => x.team.code === team.code)
    return r?.status ?? 'unknown'
  }
  const odds: OddsRow[] = sortBy(
    (winner?.answers ?? []).map((a) => {
      const isOther = !!a.isOther || /^other$/i.test(a.text.trim())
      const team = isOther ? undefined : lookup(a.text)
      return {
        answerId: a.id,
        text: a.text,
        prob: Number.isFinite(a.prob) ? a.prob : 0,
        team,
        isOther,
        standing: isOther ? ('unknown' as const) : standingOf(team),
      }
    }),
    (r) => -r.prob
  )

  const currentKey = stages.find((s) => s.state === 'current')?.stage.key
  const current = new Set(
    (currentKey ? series[currentKey] ?? [] : []).map((s) => s.answerId)
  )
  const openSeries = sortBy(
    allSeries.filter((s) => s.status === 'open'),
    (s) => (current.has(s.answerId) ? 0 : 1),
    (s) => s.index
  )
  const creators = [
    ...new Set(
      [
        ...event.matchMarkets.map((m) => markets[m.id]?.creatorUsername),
        winner?.creatorUsername,
      ].filter((c): c is string => !!c)
    ),
  ]
  return {
    event,
    title,
    status,
    stages,
    swiss,
    bracket,
    series,
    openSeries,
    pairings,
    odds,
    champion,
    finalSeries,
    problems,
    creators,
    volume: eventMarkets.reduce(
      (a, m) => a + (Number.isFinite(m.volume) ? m.volume ?? 0 : 0),
      0
    ),
    traders: Math.max(0, ...eventMarkets.map((m) => m.uniqueBettorCount ?? 0)),
  }
}

/**
 * The event to lead with: one in progress with the most series trading,
 * else the next to start, else the latest to finish.
 */
export function featuredEsportsEvent(
  views: EsportsEventView[]
): EsportsEventView | undefined {
  const inProgress = sortBy(
    views.filter((v) => v.status === 'in-progress'),
    (v) => -v.openSeries.length,
    (v) => -v.volume
  )
  if (inProgress[0]) return inProgress[0]
  const upcoming = sortBy(
    views.filter((v) => v.status === 'upcoming'),
    (v) => v.event.startDate
  )
  if (upcoming[0]) return upcoming[0]
  return sortBy(views, (v) => v.event.endDate).reverse()[0]
}
