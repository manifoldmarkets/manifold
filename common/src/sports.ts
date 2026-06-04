import { ENV } from 'common/envs/constants'
import { liquidityTiers } from 'common/tier'

// ─── Types ───────────────────────────────────────────────────────────────────

export type LiquidityTierValue = (typeof liquidityTiers)[number]

export interface StageLiquidityTiers {
  REGULAR_SEASON?: LiquidityTierValue
  GROUP_STAGE?: LiquidityTierValue
  LEAGUE_PHASE?: LiquidityTierValue
  ROUND_OF_16?: LiquidityTierValue
  QUARTER_FINALS?: LiquidityTierValue
  SEMI_FINALS?: LiquidityTierValue
  THIRD_PLACE?: LiquidityTierValue
  FINAL?: LiquidityTierValue
}

export interface TournamentConfig {
  name: string
  shortLabel: string
  footballDataCode: string
  sportsLeague: string
  startDate: string
  endDate: string
  hasGroupStageDraws: boolean
  /** When true, use team shortName instead of flag+TLA (for club tournaments) */
  useTeamNames?: boolean
  officialGroupSlug: string
  officialGroupName: string
  communityGroupSlug: string
  communityDashboardSlug: string
  /** Path portion of the dashboard URL, e.g. '/sports/world-cup-2026' */
  dashboardPath: string
  additionalGroupIds: { dev: string[]; prod: string[] }
  manifoldSportsUserId: { dev: string; prod: string }
  closeTimeOffsetMs: number
  stageLiquidityTiers: StageLiquidityTiers
}

// ─── API response types ──────────────────────────────────────────────────────

/**
 * Shape returned by the `sports-markets` API endpoint and consumed by the
 * sports dashboard page. Kept in sync between backend (`sports-markets.ts`
 * handler) and frontend (`sports-dashboard-page.tsx`).
 */
export interface SportsMarket {
  id: string
  question: string
  closeTime: number
  sportsStartTimestamp: string | null
  resolution: string | null
  resolvedAnswer: string | null
  resolutionTime: number | null
  sportsHomeScore: number | null
  sportsAwayScore: number | null
  volume: number
  url: string
  needsAttention: boolean
  answers: Array<{ id: string; text: string; prob: number }>
}

// ─── User IDs ─────────────────────────────────────────────────────────────────

const MANIFOLD_SPORTS_USER_ID_PROD = 'NnVY8olowYMYQGr346dfmHXBSpx2' // @ManifoldSports
const MANIFOLD_SPORTS_USER_ID_DEV = 'lu01Fs2BVnTQgFMMpS1qhYst9fs2' // @teststef

// ─── Tournament configs ───────────────────────────────────────────────────────

export const WORLD_CUP_2026: TournamentConfig = {
  name: 'FIFA World Cup 2026',
  shortLabel: "World Cup '26",
  footballDataCode: 'WC',
  sportsLeague: 'FIFA World Cup',
  startDate: '2026-06-11',
  endDate: '2026-07-19',
  hasGroupStageDraws: true,
  officialGroupSlug: 'ms-official-wc2026',
  officialGroupName: 'MS Official: World Cup 2026',
  communityGroupSlug: 'ms-community-wc2026',
  communityDashboardSlug: 'ms-community-wc2026',
  dashboardPath: '/sports/world-cup-2026',
  additionalGroupIds: {
    dev: [],
    prod: [
      '2hGlgVhIyvVaFyQAREPi', // sports_default
      'ypd6vR44ZzJyN9xykx6e', // soccer
    ],
  },
  manifoldSportsUserId: {
    dev: MANIFOLD_SPORTS_USER_ID_DEV,
    prod: MANIFOLD_SPORTS_USER_ID_PROD,
  },
  closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
  stageLiquidityTiers: {
    GROUP_STAGE: 1_000,
    ROUND_OF_16: 10_000,
    QUARTER_FINALS: 10_000,
    SEMI_FINALS: 10_000,
    THIRD_PLACE: 10_000,
    FINAL: 10_000,
  },
}

export const CHAMPIONS_LEAGUE_2026: TournamentConfig = {
  name: 'UEFA Champions League 2025/26',
  shortLabel: "UCL '26",
  footballDataCode: 'CL',
  sportsLeague: 'UEFA Champions League',
  startDate: '2025-09-16',
  endDate: '2026-05-31',
  hasGroupStageDraws: true,
  useTeamNames: true,
  officialGroupSlug: 'ms-official-cl-2026',
  officialGroupName: 'MS Official: Champions League 2026',
  communityGroupSlug: 'ms-community-cl-2026',
  communityDashboardSlug: 'ms-community-cl-2026',
  dashboardPath: '/sports/cl-2026',
  additionalGroupIds: {
    dev: [],
    prod: [],
  },
  manifoldSportsUserId: {
    dev: MANIFOLD_SPORTS_USER_ID_DEV,
    prod: MANIFOLD_SPORTS_USER_ID_PROD,
  },
  closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
  stageLiquidityTiers: {
    GROUP_STAGE: 1_000,
    LEAGUE_PHASE: 1_000,
    ROUND_OF_16: 10_000,
    QUARTER_FINALS: 10_000,
    SEMI_FINALS: 10_000,
    THIRD_PLACE: 10_000,
    FINAL: 10_000,
  },
}

export const PREMIER_LEAGUE_2526: TournamentConfig = {
  name: 'Premier League 2025/26',
  shortLabel: "PL '26",
  footballDataCode: 'PL',
  sportsLeague: 'Premier League',
  startDate: '2025-08-16',
  endDate: '2026-05-24',
  hasGroupStageDraws: true,
  useTeamNames: true,
  officialGroupSlug: 'ms-official-pl-2526',
  officialGroupName: 'MS Official: Premier League 2025/26',
  communityGroupSlug: 'ms-community-pl-2526',
  communityDashboardSlug: 'ms-community-pl-2526',
  dashboardPath: '/sports/pl-2526',
  additionalGroupIds: { dev: [], prod: [] },
  manifoldSportsUserId: {
    dev: MANIFOLD_SPORTS_USER_ID_DEV,
    prod: MANIFOLD_SPORTS_USER_ID_PROD,
  },
  closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
  stageLiquidityTiers: {
    REGULAR_SEASON: 1_000,
    FINAL: 10_000,
  },
}

// Dev-only test tournament
export const TEST_TOURNAMENT_2026: TournamentConfig = {
  name: 'Test Tournament [DEV]',
  shortLabel: "Test '26",
  footballDataCode: 'TEST',
  sportsLeague: 'Test Tournament',
  startDate: '2026-05-07',
  endDate: '2026-05-07',
  hasGroupStageDraws: true,
  officialGroupSlug: 'ms-official-test-2026',
  officialGroupName: 'MS Official: Test Tournament 2026',
  communityGroupSlug: 'ms-community-test-2026',
  communityDashboardSlug: 'ms-community-test-2026',
  dashboardPath: '/sports/test-2026',
  additionalGroupIds: { dev: [], prod: [] },
  manifoldSportsUserId: {
    dev: MANIFOLD_SPORTS_USER_ID_DEV,
    prod: MANIFOLD_SPORTS_USER_ID_DEV,
  },
  closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
  stageLiquidityTiers: {
    GROUP_STAGE: 1_000,
  },
}

export const TOURNAMENT_CONFIGS: Record<string, TournamentConfig> = {
  WC: WORLD_CUP_2026,
  ...(ENV === 'DEV' ? { TEST: TEST_TOURNAMENT_2026 } : {}),
}
