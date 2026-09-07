/**
 * Manually trigger resolution of finished UEFA Champions League 2025/26 markets.
 *
 * Usage:
 *   FOOTBALL_DATA_API_KEY=<key> yarn ts-node --project tsconfig.json resolve-cl-markets.ts
 *
 * Flags:
 *   DRY_RUN=true   — log what would be resolved without changing anything
 */

import { runScript } from './run-script'
import { CHAMPIONS_LEAGUE_2026, resolveTournamentMarkets } from 'shared/sports-markets'
import { ENV } from 'common/envs/constants'

const DRY_RUN = process.env.DRY_RUN === 'true'
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY ?? ''

if (require.main === module) {
  runScript(async () => {
    if (!FOOTBALL_DATA_API_KEY) {
      throw new Error('Set FOOTBALL_DATA_API_KEY environment variable first')
    }

    const config = CHAMPIONS_LEAGUE_2026
    const creatorId =
      ENV === 'DEV'
        ? config.manifoldSportsUserId.dev
        : config.manifoldSportsUserId.prod

    if (creatorId.startsWith('TODO_')) {
      throw new Error(
        `Set manifoldSportsUserId in CHAMPIONS_LEAGUE_2026 config before running.`
      )
    }

    if (DRY_RUN) console.log('[DRY RUN mode — no markets will be resolved]')

    const { resolved, skipped, errors, log } = await resolveTournamentMarkets(
      config,
      FOOTBALL_DATA_API_KEY,
      { dryRun: DRY_RUN }
    )

    for (const entry of log) {
      const icon = entry.status === 'resolved' ? '✓' : entry.status === 'error' ? '✗' : '–'
      console.log(`  ${icon} [${entry.status}] ${entry.question} → ${entry.result}`)
    }

    console.log(`\nDone. Resolved: ${resolved} | Skipped (not yet finished): ${skipped} | Errors: ${errors}`)
  })
}
