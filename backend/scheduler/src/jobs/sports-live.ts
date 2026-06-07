import { log } from 'shared/monitoring/log'
import { TOURNAMENT_CONFIGS, pollAndStoreLiveScores } from 'shared/sports-markets'

// Polls football-data.org for in-play scores and writes them into the matching
// official markets. pollAndStoreLiveScores is a no-op outside a tournament's
// active match window, so running this frequently is cheap when nothing is live.
export async function pollSportsLiveScores() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY ?? ''
  if (!apiKey) {
    log.warn('[sports-live] FOOTBALL_DATA_API_KEY not set — skipping')
    return
  }

  for (const config of Object.values(TOURNAMENT_CONFIGS)) {
    try {
      const { updated, resolved, polled } = await pollAndStoreLiveScores(
        config,
        apiKey
      )
      if (polled) {
        log(
          `[sports-live] ${config.footballDataCode}: updated=${updated} resolved=${resolved}`
        )
      }
    } catch (e) {
      log.error(
        `[sports-live] ${config.footballDataCode}: unexpected error — ${
          (e as Error).message
        }`
      )
    }
  }
}
