// Shared shapes for esports tournaments built from BALLDONTLIE data.
//
// The rule behind every type here: a template only decides the layout. Every
// team, pairing, result and link between rounds must come from a series the
// provider reported. Nothing is inferred from a market price, and nothing is
// filled in from a hand-written tournament description.

/** BALLDONTLIE's esports leagues, by their API path segment. */
export type EsportsGame = 'cs' | 'valorant' | 'lol' | 'dota'

export type EsportsTeamRef = {
  id: number
  name: string
  /** CS2 `short_name` or Valorant `acronym`, when the provider sends one. */
  code: string | null
}

/** The reader skips series the provider marks canceled or postponed. */
export type EsportsSeriesStatus = 'scheduled' | 'in_progress' | 'final'

/**
 * What the provider said about a stage, merged across the stage's series.
 * CS2 sends `stage_type` and `stage_order` on each match's stage, plus a
 * round label per match. Valorant sends a stage name per match and, from
 * `tournament_stages`, a `format` and `sequence`. LoL and Dota send none.
 */
export type EsportsStageSignal = {
  game: EsportsGame
  tournamentId: number
  stageId: number | null
  stageName: string | null
  /** The stage name without its tournament's name in front ("Swiss Stage"). */
  stageLabel?: string | null
  /** CS2 `stage.stage_type`: 'swiss' | 'group' | 'playoff', as sent. */
  stageType: string | null
  /** CS2 `stage.stage_order` or Valorant `tournament_stages.sequence`. */
  stageOrder: number | null
  /** Valorant `tournament_stages.format`, as sent. */
  format: string | null
  /** Valorant `tournament_stages.promotion_team_count`, when sent. */
  promotionCount: number | null
  /** Distinct round labels on the stage's series (CS2 `round`), as sent. */
  roundLabels: string[]
  /** CS2 `stage.rounds_count`, as sent. */
  roundsCount?: number | null
  /** Distinct teams across the stage's series. */
  teamCount?: number
  /** Series per round label, as sent. Unlabelled series are not counted. */
  labelCounts?: Record<string, number>
  /**
   * Sent values that disagreed between captures. The latest capture wins; when
   * the latest captures tie and disagree, the value is left unset. If it is
   * one that picks the layout (the stage's type, name, format or rounds
   * count), the stage is shown as a list.
   */
  problems?: string[]
}

/** A Valorant `/tournament_stages` row: stage signals matches don't carry. */
export type EsportsStageMeta = {
  game: EsportsGame
  stageId: number
  tournamentId: number
  format: string | null
  sequence: number | null
  promotionCount: number | null
}

/** One best-of series, normalized from a provider match. */
export type EsportsSeriesFacts = {
  game: EsportsGame
  /** Provider match ID; the market identity is `bdl:<game>:<id>`. */
  id: number
  tournament: { id: number; name: string; tier: string | null }
  stage: {
    id: number
    name: string
    /** CS2 `stage_type`, `stage_order` and `rounds_count`, as sent. */
    type?: string | null
    order?: number | null
    roundsCount?: number | null
  } | null
  /** CS2 round label, as sent ("Upper bracket quarterfinal"). */
  round: string | null
  /** Valorant `position`, as sent. */
  position: number | null
  bestOf: number | null
  startTimeMs: number | null
  status: EsportsSeriesStatus
  /**
   * The provider's own status word, as sent: "upcoming", "current",
   * "finished" or "defwin". A result is trusted only with "finished".
   */
  rawStatus?: string | null
  team1: EsportsTeamRef | null
  team2: EsportsTeamRef | null
  score: { team1: number; team2: number } | null
  /** Only set when the reader trusts the result (no review flag). */
  winnerId: number | null
  /**
   * Why a result or pairing is held back from counting, if it is: 'entrants',
   * 'format', 'forfeit', 'status', 'score', 'winner' or 'start'. Valorant
   * sends no best-of, so every Valorant series is held as 'format'.
   */
  review: string | null
  /** When this row was captured. The latest capture wins a disagreement. */
  observedAtMs?: number | null
}

/**
 * The layouts we can draw. `list` is the fallback for any stage whose signal
 * is missing, unknown or contradictory. It never guesses.
 */
export type StageTemplate =
  | 'swiss'
  | 'group-table'
  | 'group-gsl'
  | 'single-elim'
  | 'double-elim'
  | 'list'

export type StageClassification = {
  template: StageTemplate
  /** One plain sentence on which signal chose the template. */
  reason: string
  /** Round labels outside the known vocabulary, kept for the coverage report. */
  unknownLabels: string[]
}

export type StageState = 'done' | 'current' | 'next'

export type SwissRecord = {
  team: EsportsTeamRef
  wins: number
  losses: number
  /** Results in the order played. Counted only from trusted finals. */
  results: ('W' | 'L')[]
  /**
   * Only from evidence, never from a fixed win threshold.
   *
   * 'through', in one of two ways:
   * 1. A later stage. The team itself has a series with a known start in
   *    another stage of the same event, and every known start in that stage
   *    is after this stage's last known start. A series of its own with no
   *    start doesn't count, nor do other teams' series, nor series sent with
   *    no stage.
   * 2. The promotion count, used only when no team is through by a later
   *    stage. The provider sent a count for this stage, every series in the
   *    stage is final with a trusted winner, and the teams with the most
   *    wins, as many as the count, all have more wins than every other team.
   *
   * 'out' only when every series in the stage is final, the provider sent a
   * promotion count, and exactly that many teams are through: every other
   * team is then out.
   *
   * Otherwise null.
   */
  status: 'through' | 'out' | null
}

export type SwissView = {
  kind: 'swiss'
  /** Teams grouped by their W–L record, best record first. */
  buckets: { wins: number; losses: number; teams: SwissRecord[] }[]
  /** Series not yet final, with both teams' records going in. */
  pending: {
    series: EsportsSeriesFacts
    record1: { wins: number; losses: number }
    record2: { wins: number; losses: number }
  }[]
  /** The round in play, from the label ("Round 4") or from games played. */
  round: number | null
  /** Every series in the stage, by round then start, finished ones included. */
  series?: EsportsSeriesFacts[]
  problems: string[]
}

export type GroupTableView = {
  kind: 'group-table'
  rows: {
    team: EsportsTeamRef
    played: number
    wins: number
    losses: number
    /** Map or game difference from reported series scores. */
    diff: number
  }[]
  series: EsportsSeriesFacts[]
  problems: string[]
}

export type GslSlot =
  | 'opening-1'
  | 'opening-2'
  | 'winners'
  | 'elimination'
  | 'decider'

export type GslView = {
  kind: 'group-gsl'
  slots: { slot: GslSlot; label: string; series: EsportsSeriesFacts | null }[]
  /** Series with no round label yet. CS2 labels a series once it starts. */
  unplaced?: EsportsSeriesFacts[]
  problems: string[]
}

export type BracketLane = 'upper' | 'lower' | 'final'

export type BracketColumn = {
  lane: BracketLane
  /** The provider's label for the round ("Quarterfinal"). */
  label: string
  /** Order within its lane, earliest round first. */
  order: number
  series: EsportsSeriesFacts[]
  /** Empty slots only when the bracket size is known from round one. */
  placeholders: number
}

export type BracketView = {
  kind: 'single-elim' | 'double-elim'
  columns: BracketColumn[]
  /**
   * A line from one series to a later one, drawn only when the earlier
   * series' winner (or loser, into the lower lane) plays in the later one.
   */
  links: { from: number; to: number; carries: 'winner' | 'loser' }[]
  champion: EsportsTeamRef | null
  /** Series with no round label yet. CS2 labels a series once it starts. */
  unplaced?: EsportsSeriesFacts[]
  problems: string[]
}

export type ListView = {
  kind: 'list'
  /** Series by day (UTC date key), earliest first. No start time: 'tbd', last. */
  days: { date: string; series: EsportsSeriesFacts[] }[]
}

export type StageView =
  | SwissView
  | GroupTableView
  | GslView
  | BracketView
  | ListView

export type EsportsStageResult = {
  /** The stage name without its tournament's name in front ("Playoffs"). */
  label?: string
  signal: EsportsStageSignal
  classification: StageClassification
  state: StageState
  view: StageView
}

export type EsportsTournamentView = {
  game: EsportsGame
  tournament: { id: number; name: string; tier: string | null }
  /**
   * Every provider tournament shown as this event, in playing order. More
   * than one when the provider split it ("… Stage 1", "… Stage 2", "…").
   */
  tournamentIds?: number[]
  stages: EsportsStageResult[]
  /** Winner of the last stage's final, once it's trusted. */
  champion: EsportsTeamRef | null
  status: 'upcoming' | 'in-progress' | 'finished'
}
