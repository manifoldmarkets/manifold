import { log } from 'shared/monitoring/log'
import { TOURNAMENT_CONFIGS, createTournamentMarkets } from 'shared/sports-markets'
import { ENV } from 'common/envs/constants'

export async function createUpcomingSportsMarkets() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY ?? ''
  if (!apiKey) {
    log.warn('[sports-create] FOOTBALL_DATA_API_KEY not set — skipping')
    return
  }

  for (const config of Object.values(TOURNAMENT_CONFIGS)) {
    const creatorId =
      ENV === 'DEV'
        ? config.manifoldSportsUserId.dev
        : config.manifoldSportsUserId.prod

    if (creatorId.startsWith('TODO_')) {
      log.warn(`[sports-create] ${config.footballDataCode}: manifoldSportsUserId not configured — skipping`)
      continue
    }

    try {
      const { created, skipped, errors } = await createTournamentMarkets(config, apiKey, {
        daysAhead: 14,
        dashboardUrl: config.dashboardPath,
      })
      log(`[sports-create] ${config.footballDataCode}: created=${created} skipped=${skipped} errors=${errors}`)
    } catch (e) {
      log.error(`[sports-create] ${config.footballDataCode}: unexpected error — ${(e as Error).message}`)
    }
  }
}
