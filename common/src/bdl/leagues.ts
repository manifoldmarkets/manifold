import { mapValues } from 'lodash'

import { CLOSE_BUFFER_HOURS, SportId } from '../sports-calendar'
import { FINALS_FROM_MINUTES } from '../sports-score-polling'
import type { SportKey } from '../sports-schedule'

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

type LeagueDefinition = {
  label: string
  shortLabel?: string
  adapter: Adapter
  archetype: Archetype
  /** Null until the sport has a calendar integration. BDL's cbb means college baseball. */
  sportId: SportId | null
  sportKey: SportKey | 'baseball' | 'esports'
  version?: 1 | 2
  oddsVersion?: 1 | 2
  oddsQuery: OddsQuery | null
  /** Documented examples, never a whitelist for incoming vendor strings. */
  expectedVendors?: readonly string[]
  webhooks: boolean
  /** An independently available scores feed. Verification policy belongs to the resolver. */
  secondSource?: string | null
  seasonConvention: SeasonConvention | null
  dateFilterTz?: 'US-local' | 'UTC' | 'Asia/Shanghai'
  canEndLevel?: boolean
}

const majorBooks = ['caesars', 'draftkings', 'fanatics', 'fanduel']
const usBooks = [...majorBooks, 'betmgm', 'betrivers']
const exchanges = ['kalshi', 'polymarket']
const soccerBooks = [...majorBooks, 'polymarket']
const tourBooks = ['draftkings', 'fanduel']

const teamGame = {
  adapter: 'us-majors',
  archetype: 'team-2way',
  oddsQuery: 'game_ids',
  webhooks: true,
  seasonConvention: 'start-year',
  canEndLevel: false,
} as const

const college = { ...teamGame, adapter: 'college' } as const
const club = {
  adapter: 'soccer',
  archetype: 'team-3way',
  sportId: 'soccer',
  sportKey: 'soccer',
  oddsQuery: 'match_ids',
  expectedVendors: soccerBooks,
  webhooks: true,
  seasonConvention: 'start-year',
  canEndLevel: true,
} as const
const europeanBasketball = (
  label: string,
  shortLabel: string,
  secondSource?: string
): LeagueDefinition => ({
  label,
  shortLabel,
  adapter: 'european-basketball',
  archetype: 'team-2way',
  sportId: 'basketball',
  sportKey: 'basketball',
  oddsQuery: null,
  webhooks: false,
  secondSource,
  seasonConvention: 'start-year',
  dateFilterTz: 'UTC',
  canEndLevel: false,
})
const tennis = {
  adapter: 'tennis',
  archetype: 'h2h',
  sportId: 'tennis',
  sportKey: 'tennis',
  oddsQuery: 'match_ids',
  expectedVendors: [...tourBooks, 'caesars'],
  webhooks: true,
  seasonConvention: 'calendar-year',
} as const
const golf = {
  adapter: 'golf',
  archetype: 'field',
  sportId: null,
  sportKey: 'golf',
  oddsQuery: 'tournament_ids',
  webhooks: false,
  seasonConvention: 'calendar-year',
} as const
const esports = {
  adapter: 'esports',
  archetype: 'series',
  sportId: null,
  sportKey: 'esports',
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
    sportKey: 'nba',
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
    secondSource: 'basketball_nba',
    dateFilterTz: 'US-local',
  },
  nfl: {
    ...teamGame,
    label: 'NFL',
    sportId: 'nfl',
    sportKey: 'nfl',
    oddsQuery: 'season+week',
    expectedVendors: [...usBooks, ...exchanges],
    secondSource: 'americanfootball_nfl',
    canEndLevel: true,
  },
  nhl: {
    ...teamGame,
    label: 'NHL',
    sportId: 'nhl',
    sportKey: 'nhl',
    expectedVendors: [...majorBooks, ...exchanges],
    secondSource: 'icehockey_nhl',
  },
  wnba: {
    ...teamGame,
    label: 'WNBA',
    sportId: 'wnba',
    sportKey: 'wnba',
    expectedVendors: usBooks,
    secondSource: 'basketball_wnba',
    seasonConvention: 'calendar-year',
  },
  mlb: {
    ...teamGame,
    label: 'MLB',
    sportId: 'mlb',
    sportKey: 'mlb',
    expectedVendors: [
      'betmgm',
      'draftkings',
      'fanatics',
      'fanduel',
      'betrivers',
    ],
    secondSource: 'baseball_mlb',
    seasonConvention: 'calendar-year',
  },
  ncaaf: {
    ...college,
    label: 'College Football',
    shortLabel: 'NCAAF',
    sportId: 'cfb',
    sportKey: 'ncaaf',
    oddsQuery: 'season+week',
    expectedVendors: usBooks,
    secondSource: 'americanfootball_ncaaf',
  },
  ncaab: {
    ...college,
    label: "Men's College Basketball",
    shortLabel: 'NCAAB',
    sportId: 'cbb',
    sportKey: 'ncaab',
    expectedVendors: [...majorBooks, ...exchanges],
    secondSource: 'basketball_ncaab',
    seasonConvention: 'start-year-minus-one',
  },
  ncaaw: {
    ...college,
    label: "Women's College Basketball",
    shortLabel: 'NCAAW',
    sportId: 'wcbb',
    sportKey: 'wncaab',
    expectedVendors: usBooks,
    secondSource: 'basketball_wncaab',
    seasonConvention: 'start-year-minus-one',
  },
  cbb: {
    ...college,
    label: 'College Baseball',
    shortLabel: 'CBB',
    sportId: null,
    sportKey: 'baseball',
    webhooks: false,
    seasonConvention: 'spring-year',
    canEndLevel: true,
  },
  epl: {
    ...club,
    label: 'Premier League',
    shortLabel: 'EPL',
    version: 2,
    secondSource: 'soccer_epl',
  },
  laliga: { ...club, label: 'La Liga', secondSource: 'soccer_spain_la_liga' },
  seriea: { ...club, label: 'Serie A', secondSource: 'soccer_italy_serie_a' },
  bundesliga: {
    ...club,
    label: 'Bundesliga',
    secondSource: 'soccer_germany_bundesliga',
  },
  ligue1: {
    ...club,
    label: 'Ligue 1',
    expectedVendors: majorBooks,
    secondSource: 'soccer_france_ligue_one',
  },
  ucl: {
    ...club,
    label: 'Champions League',
    shortLabel: 'UCL',
    expectedVendors: [...tourBooks, 'caesars', 'polymarket'],
    secondSource: 'soccer_uefa_champs_league',
  },
  mls: {
    ...club,
    label: 'Major League Soccer',
    shortLabel: 'MLS',
    expectedVendors: [...tourBooks, ...exchanges],
    secondSource: 'soccer_usa_mls',
    seasonConvention: 'calendar-year',
  },
  'fifa/worldcup': {
    ...club,
    label: 'FIFA World Cup',
    shortLabel: 'World Cup',
    expectedVendors: usBooks,
    seasonConvention: 'calendar-year',
  },
  euroleague: europeanBasketball(
    'EuroLeague',
    'EuroLeague',
    'basketball_euroleague'
  ),
  eurocup: europeanBasketball('EuroCup', 'EuroCup'),
  bcl: europeanBasketball('Basketball Champions League', 'BCL'),
  acb: europeanBasketball('Liga ACB', 'ACB'),
  bsl: europeanBasketball('Turkish Basketball Super League', 'BSL'),
  gbl: europeanBasketball('Greek Basketball League', 'GBL'),
  lba: europeanBasketball('Lega Basket Serie A', 'LBA'),
  bbl: europeanBasketball('Basketball Bundesliga', 'BBL'),
  lnb: europeanBasketball('LNB Élite', 'LNB'),
  aba: europeanBasketball('ABA League', 'ABA'),
  lkl: europeanBasketball('Lithuanian Basketball League', 'LKL'),
  vtb: europeanBasketball('VTB United League', 'VTB'),
  bnxt: europeanBasketball('BNXT League', 'BNXT'),
  israel: europeanBasketball('Israeli Basketball Premier League', 'Israel'),
  cba: {
    ...teamGame,
    adapter: 'cba',
    label: 'Chinese Basketball Association',
    shortLabel: 'CBA',
    sportId: 'basketball',
    sportKey: 'basketball',
    oddsQuery: null,
    webhooks: false,
    dateFilterTz: 'Asia/Shanghai',
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
    sportKey: 'mma',
    sportId: null,
    adapter: 'mma',
    archetype: 'h2h',
    oddsQuery: 'fight_id',
    expectedVendors: [...tourBooks, 'caesars', 'kalshi'],
    webhooks: false,
    seasonConvention: null,
  },
  f1: {
    label: 'Formula 1',
    shortLabel: 'F1',
    sportKey: 'f1',
    sportId: 'f1',
    adapter: 'f1',
    archetype: 'field',
    oddsQuery: 'event_ids',
    expectedVendors: tourBooks,
    webhooks: false,
    seasonConvention: 'calendar-year',
  },
  cs: { ...esports, label: 'Counter-Strike 2', shortLabel: 'CS2' },
  valorant: { ...esports, label: 'Valorant' },
  lol: { ...esports, label: 'League of Legends', shortLabel: 'LoL' },
  dota: { ...esports, label: 'Dota 2' },
} satisfies Record<string, LeagueDefinition>

export type BdlLeagueKey = keyof typeof definitions
export const BDL_LEAGUE_KEYS = Object.keys(definitions) as BdlLeagueKey[]
export const isBdlLeagueKey = (value: string): value is BdlLeagueKey =>
  Object.prototype.hasOwnProperty.call(definitions, value)

// Future family integrations supply creation limits and missing timing policy before enabling a league.
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
    secondSource: league.secondSource ?? null,
    dateFilterTz: league.dateFilterTz ?? null,
    canEndLevel: league.canEndLevel ?? null,
    closeBufferHours: league.sportId
      ? CLOSE_BUFFER_HOURS[league.sportId]
      : null,
    finalsFromMinutes: league.sportId
      ? FINALS_FROM_MINUTES[league.sportId]
      : null,
    maxLeadDays: null,
    perRunCap: 0,
    defaultAutoCreate: false as const,
  }
}

export const BDL_LEAGUES = mapValues<
  typeof definitions,
  ReturnType<typeof leagueSettings>
>(definitions, leagueSettings)
