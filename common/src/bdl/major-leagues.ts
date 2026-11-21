import type { SportsOpeningLine } from '../sports-kickoff-interface'

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

export interface MajorCreationDecision {
  league: MajorLeague
  eventId: string | null
  question: string | null
  status: 'created' | 'dry-run' | 'skipped' | 'error'
  reason: string | null
  contractId?: string
  line?: SportsOpeningLine
  ante?: number
}

export interface MajorCreationResult {
  created: number
  wouldCreate: number
  skipped: number
  errors: number
  log: MajorCreationDecision[]
}
