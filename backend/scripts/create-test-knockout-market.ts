/**
 * Creates a single fake ROUND_OF_16 market on Dev to test the binary betting modal.
 * The market has 2 answers (no Draw), exactly like a real knockout-stage market will.
 *
 * Usage (from backend/scripts):
 *   yarn ts-node --project tsconfig.json create-test-knockout-market.ts
 *
 * To also add the market to the WC 2026 community dashboard:
 *   ADD_TO_DASHBOARD=true yarn ts-node --project tsconfig.json create-test-knockout-market.ts
 */

import { runScript } from './run-script'
import {
  WORLD_CUP_2026,
  buildMarketParams,
  ensureOfficialGroup,
} from 'shared/sports-markets'
import { FDMatch } from 'common/sports'
import { createMarketHelper } from 'api/create-market'
import { getPrivateUser } from 'shared/utils'
import { PrivateUser } from 'common/user'
import { AuthedUser } from 'api/helpers/endpoint'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { convertContract } from 'common/supabase/contracts'

const ADD_TO_DASHBOARD = process.env.ADD_TO_DASHBOARD === 'true'

// Fake match — ROUND_OF_16 so isKnockoutStage returns true:
// 2 answers, no Draw, description says "Resolves to the advancing team"
const FAKE_MATCH: FDMatch = {
  id: 9999901,
  utcDate: '2026-06-29T18:00:00Z',
  status: 'TIMED',
  matchday: null,
  stage: 'ROUND_OF_16',
  group: null,
  homeTeam: {
    id: 8881,
    name: 'Manaland FC',
    shortName: 'Manaland',
    tla: 'MNL',
    crest: '',
    area: { code: 'MNL' },
  },
  awayTeam: {
    id: 8882,
    name: 'Forecastia United',
    shortName: 'Forecastia',
    tla: 'FCT',
    crest: '',
    area: { code: 'FCT' },
  },
  score: {
    winner: null,
    duration: 'REGULAR',
    fullTime: { home: null, away: null },
    halfTime: { home: null, away: null },
  },
}

if (require.main === module) {
  runScript(async ({ pg }) => {
    const config = WORLD_CUP_2026
    const creatorId = config.manifoldSportsUserId.dev

    const privateUser = await getPrivateUser(creatorId)
    if (!privateUser) throw new Error(`Private user ${creatorId} not found`)

    const auth: AuthedUser = {
      uid: creatorId,
      creds: { kind: 'key', data: '', privateUser: privateUser as PrivateUser },
    }

    const groupResult = await ensureOfficialGroup(config, creatorId, pg)
    console.log(`Official group: ${groupResult.id} (created: ${groupResult.created})`)

    const params = buildMarketParams(FAKE_MATCH, config, groupResult.id)

    console.log(`\nCreating: "${params.question}"`)
    console.log(`Answers: ${params.answers.join(' / ')}`)
    console.log(`Description:\n${params.descriptionMarkdown}\n`)

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

    console.log(`Created market: ${contract.id} → /market/${contract.slug}`)

    // Tag with official group
    await Promise.allSettled(
      params.groupIds.map((gId) =>
        pg
          .oneOrNone(`select id from groups where id = $1 limit 1`, [gId])
          .then((g) => (g ? addGroupToContract(pg, contract, g) : null))
      )
    )

    if (ADD_TO_DASHBOARD) {
      const dash = await pg.oneOrNone<{ id: string; items: any }>(
        `select id, items from dashboards where slug = $1 limit 1`,
        [config.communityDashboardSlug]
      )
      if (!dash) {
        console.warn(
          `Dashboard "${config.communityDashboardSlug}" not found — skipping. ` +
            `Run the admin panel once to create it, then re-run with ADD_TO_DASHBOARD=true.`
        )
      } else {
        const rawItems = dash.items
        const items: Array<{ type: string; slug?: string }> = Array.isArray(rawItems)
          ? rawItems
          : typeof rawItems === 'string'
          ? JSON.parse(rawItems || '[]')
          : []

        const slug = (contract as any).slug as string
        if (!items.some((i) => i.type === 'question' && i.slug === slug)) {
          items.push({ type: 'question', slug })
          await pg.none(`update dashboards set items = $1 where id = $2`, [
            JSON.stringify(items),
            dash.id,
          ])
          console.log(`Added to dashboard "${config.communityDashboardSlug}"`)
        } else {
          console.log(`Already on dashboard — skipped.`)
        }

        // Tag with community group too
        const communityGroup = await pg.oneOrNone<{ id: string }>(
          `select id from groups where slug = $1 limit 1`,
          [config.communityGroupSlug]
        )
        if (communityGroup) {
          const contractRow = await pg.oneOrNone<{ data: any; importance_score: number | null }>(
            `select data, importance_score from contracts where id = $1`,
            [contract.id]
          )
          if (contractRow) {
            const fullContract = convertContract(contractRow)
            const groupWithSlug = await pg.oneOrNone<{ id: string; slug: string }>(
              `select id, slug from groups where id = $1 limit 1`,
              [communityGroup.id]
            )
            if (groupWithSlug) await addGroupToContract(pg, fullContract, groupWithSlug)
          }
        }
      }
    }

    console.log(`\nDone. ${ADD_TO_DASHBOARD ? 'Check the WC dashboard.' : 'Run with ADD_TO_DASHBOARD=true to also add it to the dashboard.'}`)
  })
}
