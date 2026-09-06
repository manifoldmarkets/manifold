/**
 * Manually resolve Test Tournament markets against the mock server.
 *
 * Run this once (or use run-test-sports-scheduler.sh to loop every 15 min):
 *   cd backend
 *   FOOTBALL_DATA_BASE_URL=http://localhost:7891 \
 *   FOOTBALL_DATA_API_KEY=test-mock-key \
 *   yarn ts-node --project tsconfig.json scripts/resolve-test-sports-markets.ts
 *
 * Flags:
 *   DRY_RUN=true   — log what would be resolved without changing anything
 *
 * The mock server must be running: node backend/scripts/mock-sports-server.mjs
 */

// Set env overrides BEFORE world-cup-markets.ts is required so fdFetch picks up the base URL.
// These are overridden here in case the caller forgot to export them first.
process.env.FOOTBALL_DATA_BASE_URL =
  process.env.FOOTBALL_DATA_BASE_URL ?? 'http://localhost:7891'
process.env.FOOTBALL_DATA_API_KEY =
  process.env.FOOTBALL_DATA_API_KEY ?? 'test-mock-key'

import { runScript } from './run-script'
import { TEST_TOURNAMENT_2026, resolveTournamentMarkets } from 'shared/sports-markets'
import { ENV } from 'common/envs/constants'

const DRY_RUN = process.env.DRY_RUN === 'true'

if (require.main === module) {
  runScript(async () => {
    const config = TEST_TOURNAMENT_2026
    const apiKey = process.env.FOOTBALL_DATA_API_KEY!

    const creatorId =
      ENV === 'DEV' ? config.manifoldSportsUserId.dev : config.manifoldSportsUserId.prod

    if (creatorId.startsWith('TODO_')) {
      throw new Error('manifoldSportsUserId not configured for TEST_TOURNAMENT_2026')
    }

    console.log(`[test-resolve] ENV=${ENV}  base=${process.env.FOOTBALL_DATA_BASE_URL}`)
    console.log(`[test-resolve] creator=${creatorId}  dryRun=${DRY_RUN}`)
    if (DRY_RUN) console.log('[DRY RUN — no markets will be changed]')

    const { resolved, skipped, errors, log } = await resolveTournamentMarkets(
      config,
      apiKey,
      { dryRun: DRY_RUN }
    )

    for (const entry of log) {
      const prefix =
        entry.status === 'resolved' ? '✓' : entry.status === 'error' ? '✗' : '–'
      console.log(`  ${prefix} ${entry.question} → ${entry.result}`)
    }

    console.log(
      `\nDone. resolved=${resolved}  skipped=${skipped}  errors=${errors}`
    )
  })
}
