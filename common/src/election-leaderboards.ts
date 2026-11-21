// Leaderboards for the /election page. Live topic leaderboards over the broad
// scopes (every US election, US politics) take too long per request, so the
// scheduler rebuilds them (backend/shared/src/supabase/election-leaderboards.ts)
// and the API serves the stored boards.

export const ELECTION_LEADERBOARD_KEYS = [
  '2026',
  '2028',
  '2030',
  'us-elections',
  'us-politics',
] as const
export type ElectionLeaderboardKey = (typeof ELECTION_LEADERBOARD_KEYS)[number]

export const ELECTION_LEADERBOARD_KINDS = ['profit', 'creator'] as const
export type ElectionLeaderboardKind =
  (typeof ELECTION_LEADERBOARD_KINDS)[number]

/** Entries stored per board and kind. */
export const ELECTION_LEADERBOARD_STORED = 50
/** Entries the API serves per board and kind. */
export const ELECTION_LEADERBOARD_SERVED = 20

const MIDTERMS_2026_TOPICS = [
  '2026-us-congressional-elections',
  '2026-midterms',
  '2026-us-election',
  '2026-ballot-measures',
  '26-midterm-contest',
]

const ELECTIONS_2028_TOPICS = [
  '2028-us-elections',
  '2028-us-presidential-election-6tdsp26zly',
  '2028-us-presidential-election',
  '2028-presidential-primaries',
  '2028-democratic-presidential-primar',
  '2028-us-congressional-elections',
]

const MIDTERMS_2030_TOPICS = [
  '2030-us-elections',
  '2030-us-congressional-elections',
]

// The other US election topics, past and future.
const OTHER_US_ELECTION_TOPICS = [
  '2027-us-elections',
  '2032-us-elections',
  '2032-us-congressional-elections',
  '2032-us-presidential-election',
  '2034-us-elections',
  '2034-us-congressional-elections',
  '2036-us-elections',
  '2036-us-congressional-elections',
  '2036-us-presidential-election',
  '2024-us-presidential-election',
  '2024-us-election',
  'us-congressional-elections-2024',
  '2024-us-senate-election',
  'us-2022-midterms',
  'us-2022-elections',
  'us-midterm-elections',
  '2020-us-presidential-election',
  '2025-us-elections',
  '2025-us-election',
  '2023-us-elections',
]

const US_ELECTION_TOPICS = [
  ...MIDTERMS_2026_TOPICS,
  ...ELECTIONS_2028_TOPICS,
  ...MIDTERMS_2030_TOPICS,
  ...OTHER_US_ELECTION_TOPICS,
]

export type ElectionLeaderboardConfig = {
  key: ElectionLeaderboardKey
  label: string
  /** A market in any of these topics counts, once. */
  topicSlugs: string[]
  /** How often the scheduler rebuilds the board. */
  refreshHours: number
}

// The broad boards read positions on tens of thousands of markets, so they
// refresh every 6 hours; the cycle boards hourly.
export const ELECTION_LEADERBOARDS: ElectionLeaderboardConfig[] = [
  {
    key: '2026',
    label: '2026 midterms',
    topicSlugs: MIDTERMS_2026_TOPICS,
    refreshHours: 1,
  },
  {
    key: '2028',
    label: '2028',
    topicSlugs: ELECTIONS_2028_TOPICS,
    refreshHours: 1,
  },
  {
    key: '2030',
    label: '2030 midterms',
    topicSlugs: MIDTERMS_2030_TOPICS,
    refreshHours: 1,
  },
  {
    key: 'us-elections',
    label: 'All US elections',
    topicSlugs: US_ELECTION_TOPICS,
    refreshHours: 6,
  },
  {
    key: 'us-politics',
    label: 'US politics',
    topicSlugs: ['us-politics', ...US_ELECTION_TOPICS],
    refreshHours: 6,
  },
]

export type ElectionLeaderboardEntry = {
  userId: string
  /** Profit in mana, or for creators the traders on their markets. */
  score: number
}

export type ElectionLeaderboard = {
  key: ElectionLeaderboardKey
  label: string
  /** When the board was last rebuilt (ms). */
  updatedTime: number
  profit: ElectionLeaderboardEntry[]
  creator: ElectionLeaderboardEntry[]
}

export type ElectionLeaderboards = {
  /** In ELECTION_LEADERBOARDS order; a board not built yet is left out. */
  boards: ElectionLeaderboard[]
}
