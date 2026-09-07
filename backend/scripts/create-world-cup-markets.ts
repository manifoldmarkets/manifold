/**
 * Bulk-create FIFA World Cup 2026 markets on the ManifoldSports account.
 *
 * Usage:
 *   FOOTBALL_DATA_API_KEY=<key> yarn ts-node --project tsconfig.json create-world-cup-markets.ts
 *
 * Flags:
 *   DRY_RUN=true   — log what would be created without hitting any APIs
 *   DATE_FROM      — first match date to fetch (default: today)
 *   DATE_TO        — last match date to fetch (default: 7 days from today)
 *
 * Prerequisites:
 *   1. Fill in manifoldSportsUserId.dev in backend/shared/src/sports-markets.ts
 *      with your Manifold user ID (find it on your profile page or via the API).
 *   2. Set FOOTBALL_DATA_API_KEY in your environment.
 *
 * The script auto-creates the official group (ms-official-wc2026) if it doesn't
 * exist yet, so no manual group setup is required before the first run.
 */

import { runScript } from './run-script'
import { ENV } from 'common/envs/constants'
import {
  WORLD_CUP_2026,
  buildMarketParams,
  fetchScheduledMatches,
  ensureOfficialGroup,
  stageLabel,
} from 'shared/sports-markets'
import { createMarketHelper } from 'api/create-market'
import { getPrivateUser } from 'shared/utils'
import { PrivateUser } from 'common/user'
import { AuthedUser } from 'api/helpers/endpoint'

const DRY_RUN = process.env.DRY_RUN === 'true'
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY ?? ''
const CUSTOM_NOTE = process.env.CUSTOM_NOTE
const DASHBOARD_URL = process.env.DASHBOARD_URL

function getDateRange(): { dateFrom: string; dateTo: string } {
  const dateFrom = process.env.DATE_FROM ?? new Date().toISOString().slice(0, 10)
  const dateToDefault = new Date(
    new Date(dateFrom).getTime() + 7 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10)
  const dateTo = process.env.DATE_TO ?? dateToDefault
  return { dateFrom, dateTo }
}

if (require.main === module) {
  runScript(async ({ pg }) => {
    if (!FOOTBALL_DATA_API_KEY) {
      throw new Error('Set FOOTBALL_DATA_API_KEY environment variable first')
    }

    const config = WORLD_CUP_2026
    const creatorId =
      ENV === 'DEV'
        ? config.manifoldSportsUserId.dev
        : config.manifoldSportsUserId.prod

    if (creatorId.startsWith('TODO_')) {
      throw new Error(
        `Set manifoldSportsUserId.${ENV === 'DEV' ? 'dev' : 'prod'} in WORLD_CUP_2026 config before running. ` +
          `Find your user ID on your Manifold profile page (e.g. manifold.markets/shankypanky) ` +
          `or via the API at /v0/me.`
      )
    }

    const privateUser = await getPrivateUser(creatorId)
    if (!privateUser) throw new Error(`Private user ${creatorId} not found`)

    // createMarketHelper only uses auth.uid — creds content is unused here
    const auth: AuthedUser = {
      uid: creatorId,
      creds: {
        kind: 'key',
        data: '',
        privateUser: privateUser as PrivateUser,
      },
    }

    // Step 1: Ensure the official group exists (creates it if not)
    let officialGroupId: string
    if (DRY_RUN) {
      const existing = await pg.oneOrNone<{ id: string }>(
        `select id from groups where slug = $1 limit 1`,
        [config.officialGroupSlug]
      )
      if (existing) {
        officialGroupId = existing.id
        console.log(`[DRY RUN] Official group "${config.officialGroupSlug}" exists (id: ${officialGroupId})`)
      } else {
        officialGroupId = 'dry-run-group-id'
        console.log(`[DRY RUN] Would create official group "${config.officialGroupSlug}" (curated, admin-only)`)
      }
    } else {
      const groupResult = await ensureOfficialGroup(config, creatorId, pg)
      officialGroupId = groupResult.id
      if (groupResult.created) console.log(`Created official group "${config.officialGroupSlug}"`)
      if (groupResult.restricted) console.log(`Group set to curated/restricted`)
    }

    // Step 2: Fetch scheduled matches
    const { dateFrom, dateTo } = getDateRange()
    console.log(`\nFetching ${config.sportsLeague} matches from ${dateFrom} to ${dateTo}`)
    if (DRY_RUN) console.log('[DRY RUN mode — no markets will be created]')

    const matches = await fetchScheduledMatches(
      config,
      FOOTBALL_DATA_API_KEY,
      dateFrom,
      dateTo
    )
    console.log(`Found ${matches.length} scheduled matches`)

    let created = 0
    let skipped = 0
    let errors = 0

    for (const match of matches) {
      const eventId = `fd-${match.id}`

      // Idempotency check
      const existing = await pg.oneOrNone(
        `select id from contracts where data->>'sportsEventId' = $1 and token = 'MANA' limit 1`,
        [eventId]
      )
      if (existing) {
        console.log(
          `Skipping ${match.homeTeam.name} vs ${match.awayTeam.name} — market already exists`
        )
        skipped++
        continue
      }

      const params = buildMarketParams(match, config, officialGroupId, {
        customNote: CUSTOM_NOTE,
        dashboardUrl: DASHBOARD_URL,
      })

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would create: "${params.question}"`)
        console.log(
          `  Stage: ${stageLabel(match)} | Answers: ${params.answers.join(' / ')}`
        )
        console.log(`  Close: ${new Date(params.closeTime).toUTCString()}`)
        console.log(`  Liquidity: ${params.liquidityTier}`)
        console.log(`  Groups: ${params.groupIds.join(', ')}`)
        created++
        continue
      }

      try {
        const { contract } = await createMarketHelper(
          {
            question: params.question,
            descriptionMarkdown: params.descriptionMarkdown,
            outcomeType: 'MULTIPLE_CHOICE',
            closeTime: params.closeTime,
            answers: params.answers,
            answerShortTexts: params.answerShortTexts,
            answerImageUrls: params.answerImageUrls,
            visibility: 'public',
            liquidityTier: params.liquidityTier,
            addAnswersMode: 'DISABLED',
            shouldAnswersSumToOne: true,
            sportsStartTimestamp: params.sportsStartTimestamp,
            sportsEventId: params.sportsEventId,
            sportsLeague: params.sportsLeague,
            groupIds: params.groupIds,
          },
          auth
        )
        console.log(`Created: "${params.question}" → ${contract.id}`)
        created++

        // Respect football-data.org free-tier rate limit (10 req/min)
        await new Promise((r) => setTimeout(r, 6100))
      } catch (e) {
        console.error(`Error creating market for match ${match.id}:`, e)
        errors++
      }
    }

    console.log(
      `\nDone. Created: ${created} | Skipped (already exist): ${skipped} | Errors: ${errors}`
    )
  })
}
