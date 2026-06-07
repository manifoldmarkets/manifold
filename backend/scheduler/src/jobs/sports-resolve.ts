import { log } from 'shared/monitoring/log'
import { TOURNAMENT_CONFIGS, resolveTournamentMarkets } from 'shared/sports-markets'
import { ENV } from 'common/envs/constants'

export async function resolveSportsMarkets() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY ?? ''
  if (!apiKey) {
    log.warn('[sports-resolve] FOOTBALL_DATA_API_KEY not set — skipping')
    return
  }

  for (const config of Object.values(TOURNAMENT_CONFIGS)) {
    const creatorId =
      ENV === 'DEV'
        ? config.manifoldSportsUserId.dev
        : config.manifoldSportsUserId.prod

    if (creatorId.startsWith('TODO_')) {
      log.warn(`[sports-resolve] ${config.footballDataCode}: manifoldSportsUserId not configured — skipping`)
      continue
    }

    try {
      const { resolved, skipped, errors } = await resolveTournamentMarkets(config, apiKey)
      log(`[sports-resolve] ${config.footballDataCode}: resolved=${resolved} skipped=${skipped} errors=${errors}`)
    } catch (e) {
      log.error(`[sports-resolve] ${config.footballDataCode}: unexpected error — ${(e as Error).message}`)
    }
  }
}
