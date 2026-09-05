import { toLiteMarket } from 'common/api/market-types'
import { ENV } from 'common/envs/constants'
import {
  Contract,
  Perp,
  PerpMechanism,
  nativeContractColumnsArray,
} from 'common/contract'
import { DEFAULT_CONVERSION_SCORE } from 'common/new-contract'
import {
  PERP_TAKER_FEE_BPS_DEFAULT,
  PERP_TAKER_FEE_IMPACT_DEFAULT,
} from 'common/perps/fees'
import { validateBasicOraclePoint } from 'common/perps/oracle'
import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'
import { HOUR_MS } from 'common/util/time'
import { slugify } from 'common/util/slugify'
import { camelCase, first, uniqBy } from 'lodash'
import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { getMinTradingMarkAgeMs, getOracleFeed } from 'shared/oracle-feeds'
import { assertPerpEscrowBalance } from 'shared/perps/escrow'
import { insertPerpPoolEventQuery } from 'shared/perps/queries'
import {
  PERP_LAUNCH_MARKETS,
  getPerpLaunchCreatorId,
  getPerpLaunchTopicSlug,
} from 'shared/perps/launch-manifest'
import { generateContractEmbeddings } from 'shared/supabase/contracts'
import { anythingToRichText } from 'shared/tiptap'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { broadcastNewContract } from 'shared/websockets/helpers'
import { convertUser } from 'common/supabase/users'
import { getUser, htmlToRichText, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { assertPerpExposureIncreaseEnabled } from './helpers/perp-trading-mode'

export const requireOracleFeedForPerpCreation = (oracleFeedId: string) => {
  const feedDef = getOracleFeed(oracleFeedId)
  if (!feedDef)
    throw new APIError(
      400,
      `Feed "${oracleFeedId}" is not in the oracle feed registry — add an OracleFeedDef in backend/shared/src/oracle-feeds.ts first.`
    )
  if (!feedDef.marketCreationEnabled)
    throw new APIError(
      400,
      `Feed "${oracleFeedId}" is not enabled for perp market creation.`
    )
  return feedDef
}

export const createPerp: APIHandler<'create-perp'> = async (body, auth) => {
  assertPerpExposureIncreaseEnabled()
  throwErrorIfNotAdmin(auth.uid)

  const {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    descriptionJson,
    // Unlisted by default, deliberately the opposite of create-market. Every
    // PERP rollout step is unlisted-first (the preflight's `unlisted` phase
    // requires it, and the runbook creates every launch market that way), and a public
    // contract is broadcast on `global/new-contract` at creation — which
    // cannot be recalled by unlisting afterwards. Making `public` the
    // explicit choice means a scripted creation that omits the field fails
    // safe instead of announcing the market site-wide.
    visibility = 'unlisted',
    groupIds,
    oracleFeedId,
    maxLeverage,
    maxFundingRate,
    fundingSensitivity,
    maxOraclePriceAgeMs,
    subsidyLong,
    subsidyShort,
    takerFeeBps,
    takerFeeImpact,
  } = body

  const totalSubsidy = subsidyLong + subsidyShort
  if (totalSubsidy < 1)
    throw new APIError(400, 'Total subsidy must be at least 1 mana')

  // Registry membership and the product capability are authoritative. Check
  // them before database work so a runtime-only feed is rejected even when it
  // has no price rows in the current environment.
  const feedDef = requireOracleFeedForPerpCreation(oracleFeedId)
  const launchDefinition = PERP_LAUNCH_MARKETS.find(
    (market) => market.feedId === oracleFeedId
  )
  if (launchDefinition && auth.uid !== getPerpLaunchCreatorId(ENV))
    throw new APIError(
      403,
      'Launch PERPs must be created by the official Manifold account because residual backing returns to the creator.'
    )
  if (launchDefinition && question !== launchDefinition.question)
    throw new APIError(
      400,
      `The launch title for ${oracleFeedId} must be "${launchDefinition.question}". The Perpetual type label is shown separately.`
    )

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(404, 'User not found')
  if (user.balance < totalSubsidy)
    throw new APIError(403, `Balance must be at least ${totalSubsidy}.`)

  const pg = createSupabaseDirectClient()

  // Implicit feed existence check: at least one oracle_prices row must exist.
  const oracle = await pg.oneOrNone<{
    ts: string
    price: number | string
    source_ts: string | null
  }>(
    `select ts, price, source_ts from oracle_prices where feed_id = $1
     order by ts desc limit 1`,
    [oracleFeedId]
  )
  if (!oracle)
    throw new APIError(
      400,
      `No oracle price data for feed "${oracleFeedId}" — have an internal service write to oracle_prices first.`
    )
  const oracleSourceTime =
    oracle.source_ts == null ? undefined : new Date(oracle.source_ts).getTime()
  const oraclePoint = {
    ts: new Date(oracle.ts).getTime(),
    price: Number(oracle.price),
    ...(oracleSourceTime == null ? {} : { sourceTs: oracleSourceTime }),
  }
  const oracleRejection = validateBasicOraclePoint(oraclePoint)
  if (oracleRejection)
    throw new APIError(
      500,
      `Latest point for feed "${oracleFeedId}" is invalid: ${oracleRejection}`
    )
  if (getOracleAttribution(oracleFeedId)?.showAsOf && oracleSourceTime == null)
    throw new APIError(
      400,
      `Feed "${oracleFeedId}" is missing the provider source timestamp required for attribution.`
    )

  // A maxOraclePriceAgeMs below the feed's own update cadence would freeze
  // trading between perfectly healthy updates. See getMinTradingMarkAgeMs for
  // why this is NOT staleAfterMs.
  const minMarkAgeMs = getMinTradingMarkAgeMs(feedDef)
  if (maxOraclePriceAgeMs < minMarkAgeMs)
    throw new APIError(
      400,
      `maxOraclePriceAgeMs ${maxOraclePriceAgeMs} is below feed "${oracleFeedId}" update cadence (min ${minMarkAgeMs}ms)`
    )

  // Funding must never fire more often than the market actually moves, and
  // the hourly scheduler job can't honour a sub-hour period anyway — so the
  // period is max(1h, feed cadence), frozen on the contract at create time
  // rather than recomputed from the registry (a later cadence change must
  // not silently rewrite the economics of open positions). Assert the input
  // instead of trusting the arithmetic: a zero/absent updatePeriodMs would
  // produce a config that lies about itself.
  if (!Number.isFinite(feedDef.updatePeriodMs) || feedDef.updatePeriodMs <= 0)
    throw new APIError(
      500,
      `Feed "${oracleFeedId}" has an invalid updatePeriodMs (${feedDef.updatePeriodMs}) — fix the OracleFeedDef.`
    )
  const fundingPeriodMs = Math.max(HOUR_MS, feedDef.updatePeriodMs)

  // Resolve topic tags up front so a bad group id fails before any writes.
  // Admin-only endpoint, so no per-group permission checks needed.
  const requestedGroups = groupIds
    ? await Promise.all(
        groupIds.map(async (groupId) => {
          const group = await pg.oneOrNone<{ id: string; slug: string }>(
            `select id, slug from groups where id = $1`,
            [groupId]
          )
          if (!group) throw new APIError(404, `Group ${groupId} not found`)
          return group
        })
      )
    : []
  const requiredLaunchGroups = launchDefinition
    ? await Promise.all(
        launchDefinition.requiredTopics.map(async (topic) => {
          const slug = getPerpLaunchTopicSlug(topic, ENV)
          const group = await pg.oneOrNone<{ id: string; slug: string }>(
            `select id, slug from groups where slug = $1`,
            [slug]
          )
          if (!group)
            throw new APIError(
              500,
              `Required launch topic "${topic.name}" (${slug}) is missing.`
            )
          return group
        })
      )
    : []
  // Launch topics are product configuration, not an operator memory test.
  // Always attach them while preserving any additional topics selected in the
  // form. The preflight still verifies both the join and denormalized slug.
  const groups = uniqBy(
    [...requestedGroups, ...requiredLaunchGroups],
    (group) => group.id
  )

  const proposedSlug = slugify(question)

  const contract = await pg.tx(async (tx) => {
    const collision = await tx.oneOrNone<{ id: string }>(
      `select 1 as id from contracts where slug = $1 limit 1`,
      [proposedSlug]
    )
    const slug = collision ? `${proposedSlug}-${randomString(4)}` : proposedSlug

    const now = Date.now()
    const contractId = randomString(12)

    const perp: Perp & PerpMechanism = {
      outcomeType: 'PERP',
      mechanism: 'perp',
      maxLeverage,
      maxFundingRate,
      fundingSensitivity,
      maxOraclePriceAgeMs,
      // Stamp the resolved values so a later change to the platform defaults
      // cannot silently rewrite this market's economics (same reasoning as
      // fundingPeriodMs above).
      takerFeeBps: takerFeeBps ?? PERP_TAKER_FEE_BPS_DEFAULT,
      takerFeeImpact: takerFeeImpact ?? PERP_TAKER_FEE_IMPACT_DEFAULT,
      fundingPeriodMs,
      poolLong: subsidyLong,
      poolShort: subsidyShort,
      // Subsidy is backing, not exposure: a new market has no positions, so
      // no imbalance and no funding until someone trades.
      openInterestLong: 0,
      openInterestShort: 0,
      initialSubsidy: totalSubsidy,
      initialPoolLong: subsidyLong,
      initialPoolShort: subsidyShort,
      oracleFeedId,
      oraclePrice: oraclePoint.price,
      oraclePriceTime: oraclePoint.ts,
      oracleSourceTime: oracleSourceTime ?? null,
    }

    const contract: Contract = removeUndefinedProps({
      id: contractId,
      slug,
      creatorId: user.id,
      creatorName: user.name,
      creatorUsername: user.username,
      creatorAvatarUrl: user.avatarUrl,
      creatorCreatedTime: user.createdTime,
      question,
      description:
        typeof description !== 'string' && description
          ? description
          : anythingToRichText({
              raw: description,
              html: descriptionHtml,
              markdown: descriptionMarkdown,
              jsonString: descriptionJson,
            }) ?? htmlToRichText(`<p> </p>`),
      visibility,
      createdTime: now,
      lastUpdatedTime: now,
      isResolved: false,
      token: 'MANA',
      volume: 0,
      volume24Hours: 0,
      elasticity: 0,
      collectedFees: {
        creatorFee: 0,
        liquidityFee: 0,
        platformFee: 0,
      },
      uniqueBettorCount: 0,
      uniqueBettorCountDay: 0,
      importanceScore: 0,
      homePageScoreAdjustment: 0,
      dailyScore: 0,
      freshnessScore: 0,
      conversionScore: DEFAULT_CONVERSION_SCORE,
      viewCount: 0,
      boosted: false,
      ...perp,
    } as unknown as Contract)

    const nativeColumns = nativeContractColumnsArray.filter((c) => c !== 'data')
    const nativeValues = nativeColumns.map((column) => {
      const camelKey = camelCase(column) as keyof Contract
      return camelKey in contract ? (contract as any)[camelKey] : null
    })
    const nativeKeys = nativeColumns.map(camelCase)
    const contractDataToInsert = Object.fromEntries(
      Object.entries(contract).filter(([k]) => !nativeKeys.includes(k))
    )

    const contractQuery = pgp.as.format(
      `insert into contracts (id, data, ${nativeColumns.join(',')})
       values ($1, $2, ${nativeValues.map((_, i) => `$${i + 3}`)})`,
      [contract.id, JSON.stringify(contractDataToInsert), ...nativeValues]
    )
    await tx.none(contractQuery)

    // Creator pays the subsidy into the contract pools.
    await runTxnOutsideBetQueue(tx, {
      fromId: user.id,
      fromType: 'USER',
      toId: contract.id,
      toType: 'CONTRACT',
      amount: totalSubsidy,
      token: 'M$',
      category: 'CREATE_CONTRACT_ANTE',
    })
    await assertPerpEscrowBalance(tx, contract.id, {
      L: subsidyLong,
      S: subsidyShort,
    })
    await tx.none(
      insertPerpPoolEventQuery({
        contractId: contract.id,
        eventType: 'create',
        appliedTime: now,
        oracleTime: oraclePoint.ts,
        oraclePrice: oraclePoint.price,
        poolBefore: { L: 0, S: 0 },
        poolAfter: { L: subsidyLong, S: subsidyShort },
        cashIn: totalSubsidy,
        cashOut: 0,
        data: { subsidyLong, subsidyShort },
      })
    )

    const userRow = await tx.oneOrNone(
      `select * from users where id = $1 limit 1`,
      [user.id]
    )
    const refreshedUser = first(userRow ? [userRow] : [])
      ? convertUser(userRow)
      : user
    broadcastNewContract(contract, refreshedUser)

    return contract
  })

  // Topic tags + embeddings make the perp discoverable (topic pages, feed,
  // search). A failed follow-up cannot roll back the already-funded contract,
  // so creation reports the market and the launch preflight/backfill gates
  // publication on both prerequisites.
  if (groups.length > 0) {
    const topicResults = await Promise.allSettled(
      groups.map((g) =>
        pg.tx((tx) => addGroupToContract(tx, contract, g, auth.uid))
      )
    )
    topicResults.forEach((result, index) => {
      if (result.status === 'rejected')
        log.error(
          `Failed to attach topic ${groups[index].slug} to perp ${contract.id}`,
          result.reason
        )
    })
  }

  return {
    result: toLiteMarket(contract),
    continue: async () => {
      await generateContractEmbeddings(contract, pg).catch((e) =>
        log.error(`Failed to generate embeddings for perp ${contract.id}`, e)
      )
    },
  }
}
