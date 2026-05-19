import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getPrivateUser, getUser } from 'shared/utils'
import { PrivateUser } from 'common/user'
import { ENV } from 'common/envs/constants'
import { liquidityTiers } from 'common/tier'
import {
  TOURNAMENT_CONFIGS,
  buildMarketParams,
  ensureOfficialGroup,
  ensureCommunityAssets,
  fetchAllCompetitionMatches,
  matchSportsEventId,
  StageLiquidityTiers,
} from 'shared/sports-markets'
import { createMarketHelper } from './create-market'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { AuthedUser } from './helpers/endpoint'

export const adminSportsCreateMarkets: APIHandler<
  'admin-sports-create-markets'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const apiKey = process.env.FOOTBALL_DATA_API_KEY ?? ''
  if (!apiKey) throw new APIError(500, 'FOOTBALL_DATA_API_KEY not set on server')

  const {
    competitionCode,
    matchIds,
    dryRun,
    customNote,
    dashboardUrl,
    liquidityTierOverrides,
  } = props

  const config = TOURNAMENT_CONFIGS[competitionCode]
  if (!config) throw new APIError(400, `Unknown competition code: ${competitionCode}`)

  const creatorId =
    ENV === 'DEV'
      ? config.manifoldSportsUserId.dev
      : config.manifoldSportsUserId.prod

  if (creatorId.startsWith('TODO_')) {
    throw new APIError(
      500,
      'ManifoldSports user ID not configured. Set it in sports-markets.ts.'
    )
  }

  const pg = createSupabaseDirectClient()

  // Step 1: ensure the official group + community assets exist
  const creatorUser = dryRun ? null : await getUser(creatorId)

  const groupResult = dryRun
    ? await (async () => {
        const existing = await pg.oneOrNone<{
          id: string
          privacy_status: string
        }>(
          `select id, privacy_status from groups where slug = $1 limit 1`,
          [config.officialGroupSlug]
        )
        if (existing) {
          return {
            id: existing.id,
            created: false,
            restricted: existing.privacy_status === 'curated',
          }
        }
        return { id: 'dry-run-group', created: false, restricted: false }
      })()
    : await ensureOfficialGroup(config, creatorId, pg)

  const communityResult = dryRun
    ? { groupId: 'dry-run-community-group', groupCreated: false, dashboardId: 'dry-run-community-dash', dashboardCreated: false }
    : await ensureCommunityAssets(
        config,
        creatorId,
        creatorUser?.username ?? '',
        creatorUser?.name ?? '',
        creatorUser?.avatarUrl ?? '',
        pg
      )

  // Step 2: fetch scheduled matches (status=SCHEDULED populates team names correctly)
  const allMatches = await fetchAllCompetitionMatches(config, apiKey, { status: 'SCHEDULED' })
  const matchById = new Map(allMatches.map((m) => [m.id, m]))

  // Step 3: build auth for createMarketHelper (only uid matters)
  let creatorAuth: AuthedUser | null = null
  if (!dryRun) {
    const privateUser = await getPrivateUser(creatorId)
    if (!privateUser)
      throw new APIError(500, `Private user ${creatorId} not found`)
    creatorAuth = {
      uid: creatorId,
      creds: { kind: 'key', data: '', privateUser: privateUser as PrivateUser },
    }
  }

  // Coerce overrides to valid LiquidityTierValue
  const validLiqTiers = new Set<number>(liquidityTiers)
  const safeOverrides = liquidityTierOverrides
    ? Object.fromEntries(
        Object.entries(liquidityTierOverrides).filter(([, v]) =>
          validLiqTiers.has(v)
        )
      )
    : undefined

  const results: Array<{
    matchId: number
    status: 'created' | 'skipped' | 'dry-run' | 'error'
    question: string
    marketId: string | null
    reason: string | null
  }> = []

  for (const matchId of matchIds) {
    const match = matchById.get(matchId)
    if (!match) {
      results.push({
        matchId,
        status: 'error',
        question: `Match ${matchId}`,
        marketId: null,
        reason: 'Match not found in competition fixtures',
      })
      continue
    }

    if (!match.homeTeam.name || !match.awayTeam.name) {
      results.push({ matchId, status: 'skipped', question: `Match ${matchId}`, marketId: null, reason: 'Teams not yet determined' })
      continue
    }

    const eventId = matchSportsEventId(match)

    // Idempotency check
    const existing = await pg.oneOrNone<{ id: string }>(
      `select id from contracts where data->>'sportsEventId' = $1 and token = 'MANA' limit 1`,
      [eventId]
    )
    if (existing) {
      results.push({
        matchId,
        status: 'skipped',
        question: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
        marketId: existing.id,
        reason: 'Market already exists',
      })
      continue
    }

    const params = buildMarketParams(match, config, groupResult.id, {
      customNote,
      dashboardUrl,
      liquidityTierOverrides: safeOverrides as Partial<StageLiquidityTiers>,
    })

    if (dryRun) {
      results.push({
        matchId,
        status: 'dry-run',
        question: params.question,
        marketId: null,
        reason: null,
      })
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
        creatorAuth!
      )

      // Attach group tags (createMarketHelper doesn't do this — only the full handler does)
      await Promise.allSettled(
        params.groupIds.map((gId) =>
          pg.oneOrNone(
            `select id from groups where id = $1 limit 1`,
            [gId]
          ).then((g) => g ? addGroupToContract(pg, contract, g) : null)
        )
      )

      results.push({
        matchId,
        status: 'created',
        question: params.question,
        marketId: contract.id,
        reason: null,
      })
    } catch (e) {
      results.push({
        matchId,
        status: 'error',
        question: params.question,
        marketId: null,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return {
    groupId: groupResult.id,
    groupCreated: groupResult.created,
    groupRestricted: groupResult.restricted,
    communityGroupId: communityResult.groupId,
    communityGroupCreated: communityResult.groupCreated,
    communityDashboardId: communityResult.dashboardId,
    communityDashboardCreated: communityResult.dashboardCreated,
    results,
  }
}
