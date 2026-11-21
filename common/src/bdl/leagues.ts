import { mapValues } from 'lodash'

import {
  CLOSE_BUFFER_HOURS,
  FINALS_FROM_MINUTES,
  SPORT_ID_TO_SPORT_KEY,
  SportId,
} from '../sports-calendar'
import {
  BDL_DEFAULT_MAX_LEAD_DAYS,
  BDL_PER_LEAGUE_RUN_CAP,
  BDL_TENNIS_CLOSE_HOURS,
  BDL_ESPORTS_CLOSE_HOURS,
  BDL_ESPORTS_FINALS_FROM_MINUTES,
} from './constants'

type Archetype = 'team-2way' | 'team-3way' | 'h2h' | 'field' | 'series'
type Adapter =
  | 'us-majors'
  | 'college'
  | 'soccer'
  | 'european-basketball'
  | 'cba'
  | 'tennis'
  | 'golf'
  | 'mma'
  | 'f1'
  | 'esports'
type SeasonConvention =
  | 'start-year'
  | 'calendar-year'
  | 'spring-year'
  | 'start-year-minus-one'
type OddsQuery =
  | 'game_ids'
  | 'season+week'
  | 'match_ids'
  | 'fight_id'
  | 'tournament_ids'
  | 'event_ids'

// Multi-country events use the venue time zone supplied by the family adapter.
type TitleDateZone =
  | 'venue'
  | 'UTC'
  | `America/${string}`
  | `Asia/${string}`
  | `Europe/${string}`
type TieRule =
  | 'review'
  | 'split-evenly'
  | 'draw-answer'
  | 'draw-or-no-contest-answer'

type LeagueDefinition = {
  label: string
  shortLabel?: string
  adapter: Adapter
  archetype: Archetype
  sportId: SportId
  titleDateTz: TitleDateZone
  maxLeadDays?: number
  perRunCap?: number
  closeAtStart?: boolean
  startSignal?: 'event-start' | 'card-segment-start'
  safetyCloseBasis?: 'event-start' | 'per-fight-maximum' | 'final-round-end'
  closeHoursByBestOf?: Readonly<Partial<Record<1 | 3 | 5, number>>>
  finalsMinutesByBestOf?: Readonly<Partial<Record<1 | 3 | 5, number>>>
  version?: 1 | 2
  oddsVersion?: 1 | 2
  oddsQuery: OddsQuery | null
  /** Documented examples, never a whitelist for incoming vendor strings. */
  expectedVendors?: readonly string[]
  webhooks: boolean
  seasonConvention: SeasonConvention | null
  dateFilterTz?: 'US-local' | 'UTC' | 'Asia/Shanghai'
  canEndLevel?: boolean
  tieRule?: TieRule
}

const majorBooks = ['caesars', 'draftkings', 'fanatics', 'fanduel']
const usBooks = [...majorBooks, 'betmgm', 'betrivers']
const exchanges = ['kalshi', 'polymarket']
const soccerBooks = [...majorBooks, 'polymarket']
const tourBooks = ['draftkings', 'fanduel']

const teamGame = {
  adapter: 'us-majors',
  titleDateTz: 'America/New_York',
  archetype: 'team-2way',
  oddsQuery: 'game_ids',
  webhooks: true,
  seasonConvention: 'start-year',
  canEndLevel: false,
} as const

const college = { ...teamGame, adapter: 'college' } as const
const club = {
  adapter: 'soccer',
  titleDateTz: 'venue',
  tieRule: 'draw-answer',
  archetype: 'team-3way',
  sportId: 'soccer',
  oddsQuery: 'match_ids',
  expectedVendors: soccerBooks,
  webhooks: true,
  seasonConvention: 'start-year',
  canEndLevel: true,
} as const
const europeanBasketball = (
  label: string,
  shortLabel: string,
  titleDateTz: TitleDateZone
): LeagueDefinition => ({
  label,
  shortLabel,
  adapter: 'european-basketball',
  archetype: 'team-2way',
  sportId: 'basketball',
  oddsQuery: null,
  webhooks: false,
  titleDateTz,
  seasonConvention: 'start-year',
  dateFilterTz: 'UTC',
  canEndLevel: false,
})
const tennis = {
  adapter: 'tennis',
  closeHoursByBestOf: BDL_TENNIS_CLOSE_HOURS,
  titleDateTz: 'venue',
  archetype: 'h2h',
  sportId: 'tennis',
  oddsQuery: 'match_ids',
  expectedVendors: [...tourBooks, 'caesars'],
  webhooks: true,
  seasonConvention: 'calendar-year',
} as const
const golf = {
  adapter: 'golf',
  safetyCloseBasis: 'final-round-end',
  titleDateTz: 'venue',
  archetype: 'field',
  sportId: 'golf',
  oddsQuery: 'tournament_ids',
  webhooks: false,
  seasonConvention: 'calendar-year',
} as const
const esports = {
  adapter: 'esports',
  closeHoursByBestOf: BDL_ESPORTS_CLOSE_HOURS,
  finalsMinutesByBestOf: BDL_ESPORTS_FINALS_FROM_MINUTES,
  titleDateTz: 'UTC',
  archetype: 'series',
  oddsQuery: null,
  webhooks: false,
  seasonConvention: null,
} as const

// Keys are the provider's path slugs. Calendar and UI identifiers have their own namespaces.
const definitions = {
  nba: {
    ...teamGame,
    label: 'NBA',
    sportId: 'nba',
    oddsVersion: 2,
    expectedVendors: [
      ...usBooks,
      ...exchanges,
      'ballybet',
      'bet365',
      'betparx',
      'betway',
      'rebet',
    ],
    dateFilterTz: 'US-local',
  },
  nfl: {
    ...teamGame,
    label: 'NFL',
    sportId: 'nfl',
    tieRule: 'split-evenly',
    oddsQuery: 'season+week',
    expectedVendors: [...usBooks, ...exchanges],
    canEndLevel: true,
  },
  nhl: {
    ...teamGame,
    label: 'NHL',
    sportId: 'nhl',
    expectedVendors: [...majorBooks, ...exchanges],
  },
  wnba: {
    ...teamGame,
    label: 'WNBA',
    sportId: 'wnba',
    expectedVendors: usBooks,
    seasonConvention: 'calendar-year',
  },
  mlb: {
    ...teamGame,
    label: 'MLB',
    sportId: 'mlb',
    expectedVendors: [
      'betmgm',
      'draftkings',
      'fanatics',
      'fanduel',
      'betrivers',
    ],
    seasonConvention: 'calendar-year',
  },
  ncaaf: {
    ...college,
    label: 'College Football',
    shortLabel: 'NCAAF',
    sportId: 'cfb',
    oddsQuery: 'season+week',
    expectedVendors: usBooks,
  },
  ncaab: {
    ...college,
    label: "Men's College Basketball",
    shortLabel: 'NCAAB',
    sportId: 'cbb',
    expectedVendors: [...majorBooks, ...exchanges],
    seasonConvention: 'start-year-minus-one',
  },
  ncaaw: {
    ...college,
    label: "Women's College Basketball",
    shortLabel: 'NCAAW',
    sportId: 'wcbb',
    expectedVendors: usBooks,
    seasonConvention: 'start-year-minus-one',
  },
  cbb: {
    ...college,
    label: 'College Baseball',
    shortLabel: 'CBB',
    sportId: 'cbase',
    webhooks: false,
    seasonConvention: 'spring-year',
    canEndLevel: true,
  },
  epl: {
    ...club,
    titleDateTz: 'Europe/London',
    label: 'Premier League',
    shortLabel: 'EPL',
    version: 2,
  },
  laliga: { ...club, titleDateTz: 'Europe/Madrid', label: 'La Liga' },
  seriea: { ...club, titleDateTz: 'Europe/Rome', label: 'Serie A' },
  bundesliga: {
    ...club,
    titleDateTz: 'Europe/Berlin',
    label: 'Bundesliga',
  },
  ligue1: {
    ...club,
    titleDateTz: 'Europe/Paris',
    label: 'Ligue 1',
    expectedVendors: majorBooks,
  },
  ucl: {
    ...club,
    label: 'Champions League',
    shortLabel: 'UCL',
    expectedVendors: [...tourBooks, 'caesars', 'polymarket'],
  },
  mls: {
    ...club,
    titleDateTz: 'America/New_York',
    label: 'Major League Soccer',
    shortLabel: 'MLS',
    expectedVendors: [...tourBooks, ...exchanges],
    seasonConvention: 'calendar-year',
  },
  'fifa/worldcup': {
    ...club,
    label: 'FIFA World Cup',
    shortLabel: 'World Cup',
    expectedVendors: usBooks,
    seasonConvention: 'calendar-year',
  },
  euroleague: europeanBasketball('EuroLeague', 'EuroLeague', 'venue'),
  eurocup: europeanBasketball('EuroCup', 'EuroCup', 'venue'),
  bcl: europeanBasketball('Basketball Champions League', 'BCL', 'venue'),
  acb: europeanBasketball('Liga ACB', 'ACB', 'Europe/Madrid'),
  bsl: europeanBasketball(
    'Turkish Basketball Super League',
    'BSL',
    'Europe/Istanbul'
  ),
  gbl: europeanBasketball('Greek Basketball League', 'GBL', 'Europe/Athens'),
  lba: europeanBasketball('Lega Basket Serie A', 'LBA', 'Europe/Rome'),
  bbl: europeanBasketball('Basketball Bundesliga', 'BBL', 'Europe/Berlin'),
  lnb: europeanBasketball('LNB Élite', 'LNB', 'Europe/Paris'),
  aba: europeanBasketball('ABA League', 'ABA', 'venue'),
  lkl: europeanBasketball(
    'Lithuanian Basketball League',
    'LKL',
    'Europe/Vilnius'
  ),
  vtb: europeanBasketball('VTB United League', 'VTB', 'venue'),
  bnxt: europeanBasketball('BNXT League', 'BNXT', 'venue'),
  israel: europeanBasketball(
    'Israeli Basketball Premier League',
    'Israel',
    'Asia/Jerusalem'
  ),
  cba: {
    ...teamGame,
    adapter: 'cba',
    label: 'Chinese Basketball Association',
    shortLabel: 'CBA',
    sportId: 'basketball',
    oddsQuery: null,
    webhooks: false,
    dateFilterTz: 'Asia/Shanghai',
    titleDateTz: 'Asia/Shanghai',
  },
  atp: { ...tennis, label: 'ATP Tour', shortLabel: 'ATP' },
  wta: { ...tennis, label: 'WTA Tour', shortLabel: 'WTA' },
  pga: {
    ...golf,
    label: 'PGA Tour',
    shortLabel: 'PGA',
    version: 2,
    oddsVersion: 1,
    expectedVendors: tourBooks,
    webhooks: true,
  },
  lpga: {
    ...golf,
    label: 'LPGA Tour',
    shortLabel: 'LPGA',
    expectedVendors: ['draftkings'],
  },
  mma: {
    label: 'MMA',
    sportId: 'mma',
    titleDateTz: 'venue',
    canEndLevel: true,
    tieRule: 'draw-or-no-contest-answer',
    adapter: 'mma',
    startSignal: 'card-segment-start',
    safetyCloseBasis: 'per-fight-maximum',
    archetype: 'h2h',
    oddsQuery: 'fight_id',
    expectedVendors: [...tourBooks, 'caesars', 'kalshi'],
    webhooks: false,
    seasonConvention: null,
  },
  f1: {
    label: 'Formula 1',
    shortLabel: 'F1',
    sportId: 'f1',
    titleDateTz: 'venue',
    adapter: 'f1',
    archetype: 'field',
    oddsQuery: 'event_ids',
    expectedVendors: tourBooks,
    webhooks: false,
    seasonConvention: 'calendar-year',
  },
  cs: {
    ...esports,
    sportId: 'cs2',
    label: 'Counter-Strike 2',
    shortLabel: 'CS2',
  },
  valorant: { ...esports, sportId: 'valorant', label: 'Valorant' },
  lol: {
    ...esports,
    sportId: 'lol',
    label: 'League of Legends',
    shortLabel: 'LoL',
  },
  dota: { ...esports, sportId: 'dota2', label: 'Dota 2' },
} satisfies Record<string, LeagueDefinition>

export type BdlLeagueKey = keyof typeof definitions
export const BDL_LEAGUE_KEYS = Object.keys(definitions) as BdlLeagueKey[]
export const isBdlLeagueKey = (value: string): value is BdlLeagueKey =>
  Object.prototype.hasOwnProperty.call(definitions, value)

function leagueSettings(league: LeagueDefinition, key: string) {
  const apiBase = `/${key}/v${league.version ?? 1}`
  return {
    ...league,
    specSlug: key === 'fifa/worldcup' ? 'fifa' : key,
    apiBase,
    oddsApiBase:
      league.oddsQuery === null
        ? null
        : `/${key}/v${league.oddsVersion ?? league.version ?? 1}`,
    shortLabel: league.shortLabel ?? league.label,
    expectedVendors: league.expectedVendors ?? [],
    sportKey: SPORT_ID_TO_SPORT_KEY[league.sportId],
    verification: 'bdl-only' as const,
    tieRule: league.tieRule ?? 'review',
    threeWay:
      league.tieRule === 'draw-answer' ||
      league.tieRule === 'draw-or-no-contest-answer',
    dateFilterTz: league.dateFilterTz ?? null,
    canEndLevel: league.canEndLevel ?? null,
    closeAtStart: league.closeAtStart ?? false,
    startSignal: league.startSignal ?? 'event-start',
    safetyCloseBasis: league.safetyCloseBasis ?? 'event-start',
    closeBufferHours:
      league.safetyCloseBasis === 'per-fight-maximum'
        ? null
        : CLOSE_BUFFER_HOURS[league.sportId],
    closeHoursByBestOf: league.closeHoursByBestOf ?? null,
    finalsFromMinutes: FINALS_FROM_MINUTES[league.sportId],
    finalsMinutesByBestOf: league.finalsMinutesByBestOf ?? null,
    maxLeadDays: league.maxLeadDays ?? BDL_DEFAULT_MAX_LEAD_DAYS,
    perRunCap: league.perRunCap ?? BDL_PER_LEAGUE_RUN_CAP,
    defaultAutoCreate: false as const,
  }
}

export const BDL_LEAGUES = mapValues<
  typeof definitions,
  ReturnType<typeof leagueSettings>
>(definitions, leagueSettings)
