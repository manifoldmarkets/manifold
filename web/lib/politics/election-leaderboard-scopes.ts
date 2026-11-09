import type {
  ElectionLeaderboard,
  ElectionLeaderboardKey,
} from 'common/election-leaderboards'
import type { ElectionPhase } from './election-phase'
import { MIDTERMS_2026_LEADERBOARD_UNTIL } from './elections-2028-config'

// The scopes the page offers: 2030's from the inauguration, when the page
// moves on to it; the rest always. It opens on the 2026 midterms for a
// while, then on the cycle it leads with.
export function leaderboardScopes(
  boards: ElectionLeaderboard[],
  phase: ElectionPhase,
  now: number
): { boards: ElectionLeaderboard[]; defaultKey: ElectionLeaderboardKey } {
  const later = phase === 'midterms2030'
  const shown = boards.filter((b) => b.key !== '2030' || later)
  const wanted: ElectionLeaderboardKey =
    now < MIDTERMS_2026_LEADERBOARD_UNTIL ? '2026' : later ? '2030' : '2028'
  const defaultKey = shown.some((b) => b.key === wanted)
    ? wanted
    : shown[0]?.key ?? wanted
  return { boards: shown, defaultKey }
}
