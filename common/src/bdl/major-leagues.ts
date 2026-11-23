import type { SportsOpeningLine } from '../sports-kickoff-interface'

/** PostgreSQL integer columns hold whole-mana funding settings. */
export const MAX_SPORTS_CREATION_AMOUNT = 2_147_483_647
export const MAX_CREATION_GAME_KEYS = 200

export const MAJOR_LEAGUES = ['nba', 'nhl', 'wnba', 'mlb', 'nfl'] as const
export type MajorLeague = (typeof MAJOR_LEAGUES)[number]
export const isMajorLeague = (key: string): key is MajorLeague =>
  MAJOR_LEAGUES.some((league) => league === key)

export const MAJOR_WAVES: Record<MajorLeague, number> = {
  nba: 1,
  nhl: 2,
  wnba: 3,
  mlb: 3,
  nfl: 3,
}

export interface MajorSettings {
  league: MajorLeague
  baseAnte: number
  startsOn: string
  groupSlugs: string[]
  waveLeagueKeys: MajorLeague[]
  limits: {
    perLeagueDailyAnte: number
    perWaveAnte: number
    globalOpenAnte: number
  }
}

export type MajorSettingRow = {
  scope: string
  cap: number
  baseAnte: number | null
  startsOn: string | null
  groupSlugs: string[] | null
}

export type StoredMajorSettingRow = Omit<MajorSettingRow, 'cap'> & {
  cap: number | null
}

export type MajorCreationConfirmation = {
  awayId: number
  homeId: number
  startTime: number
  /** Only for a forced preview: every prior canceled official copy of this event. */
  canceledContractIds?: string[]
}

export interface MajorCreationDecision {
  league: MajorLeague
  eventId: string | null
  question: string | null
  status: 'created' | 'dry-run' | 'skipped' | 'error'
  reason: string | null
  contractId?: string
  answerLabels?: string[]
  confirmation?: MajorCreationConfirmation
  line?: SportsOpeningLine
  ante?: number
}

export type AdminMajorCreationResult = Omit<MajorCreationResult, 'log'> & {
  log: Omit<MajorCreationDecision, 'line'>[]
}

export interface MajorCreationResult {
  created: number
  wouldCreate: number
  skipped: number
  errors: number
  log: MajorCreationDecision[]
}
