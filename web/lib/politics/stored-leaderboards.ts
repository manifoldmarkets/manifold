import type { ElectionLeaderboard } from 'common/election-leaderboards'
import { api } from 'web/lib/api/api'

const LEADERBOARD_TIMEOUT_MS = 5_000

// The stored election leaderboards, for a page's getStaticProps (the
// scheduler rebuilds them; reading them is one small query). None if the
// API can't serve them yet.
export async function getStoredLeaderboards(): Promise<ElectionLeaderboard[]> {
  try {
    const { boards } = await api(
      'election-leaderboards',
      {},
      { signal: AbortSignal.timeout(LEADERBOARD_TIMEOUT_MS) }
    )
    // Top traders are the ones who made money: a thin board otherwise lists
    // losses too.
    return boards
      .map((b) => ({ ...b, profit: b.profit.filter((e) => e.score > 0) }))
      .filter((b) => b.profit.length > 0 || b.creator.length > 0)
  } catch (e) {
    console.error('election leaderboards failed', e)
    return []
  }
}
