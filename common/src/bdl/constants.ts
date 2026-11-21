import { DAY_MS, HOUR_MS, MINUTE_MS } from '../util/time'

// Decided defaults. Operators can configure limits and starting liquidity by league.
export const BDL_DEFAULT_MAX_LEAD_DAYS = 14
export const BDL_CREATION_CADENCE_MS = HOUR_MS
export const BDL_PER_LEAGUE_RUN_CAP = 25
export const BDL_GLOBAL_RUN_CAP = 300
export const BDL_DEFAULT_STARTING_LIQUIDITY = 100
export const BDL_BUDGET_DEFAULTS = {
  perLeagueDailyAnte: null,
  globalOpenAnte: null,
  perWaveAnte: null,
} as const

// Reserved kickoff settings. Funding stays off until its withdrawal integration.
export const BDL_KICKOFF_FUNDING = {
  enabled: false,
  budget: 2000,
  targetWorstCase: 1000,
  anteReserve: 100_000,
} as const

// Existing creation cutoff and observed exchange quote validation thresholds.
export const BDL_MIN_CREATION_LEAD_MS = 5 * MINUTE_MS
export const BDL_PLACEHOLDER_ABS_MONEYLINE = 100
export const BDL_EXCHANGE_OVERROUND = { min: 0.995, max: 1.005 } as const
export const BDL_ODDS_MAX_AGE_MS = 30 * MINUTE_MS
export const BDL_VENDOR_FEED_STALE_MS = 10 * MINUTE_MS
// Default maximum absolute probability difference when books also quote.
export const BDL_EXCHANGE_BOOKS_BAND = 0.05

// Decided lifecycle defaults. Existing F1 settlement retains its own delay.
export const BDL_FINAL_SETTLEMENT_DELAY_MS = 0
export const BDL_F1_SETTLEMENT_DELAY_MS = 2 * HOUR_MS
export const BDL_CANCELLATION_HOLD_MS = DAY_MS
export const BDL_UNDATED_POSTPONEMENT_REVIEW_MS = 7 * DAY_MS
export const BDL_CORRECTION_WATCH_MS = 14 * DAY_MS

// Monitoring and event matching defaults.
export const BDL_STUCK_GAME_MS = 4 * HOUR_MS
export const BDL_OVERDUE_ALERT_MS = 3 * HOUR_MS
export const BDL_OVERDUE_CHECK_INTERVAL_MS = HOUR_MS
export const BDL_OPEN_ODDS_MATCH_WINDOW_MS = 6 * HOUR_MS
export const BDL_REISSUED_EVENT_MATCH_WINDOW_MS = 7 * DAY_MS

// Timing defaults keyed by the best-of format of each match.
export const BDL_TENNIS_CLOSE_HOURS = { 3: 3, 5: 5 } as const
export const BDL_ESPORTS_CLOSE_HOURS = { 1: 1.5, 3: 4, 5: 6 } as const
export const BDL_ESPORTS_FINALS_FROM_MINUTES = {
  1: 45,
  3: 120,
  5: 200,
} as const

// Process budgets and fractions of the vendor quota remaining.
export const BDL_REQUESTS_PER_MINUTE = {
  scheduler: 300,
  api: 30,
  dev: 150,
  recorder: 60,
  codex: 60,
} as const
export const BDL_QUOTA_SLOW_FRACTION = 0.2
export const BDL_QUOTA_PAUSE_FRACTION = 0.05
export const BDL_WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * MINUTE_MS
// Default number of individually priced runners in addition to the Other answer.
export const BDL_FIELD_PRICED_RUNNER_CAP = 30
