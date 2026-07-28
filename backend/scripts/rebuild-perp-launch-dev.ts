import * as admin from 'firebase-admin'
import { Request } from 'express'
import { uniq } from 'lodash'

import { createPerp } from 'api/create-perp'
import { resolveMarketMain } from 'api/resolve-market'
import { AuthedUser } from 'api/helpers/endpoint'
import { PerpContract } from 'common/contract'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import {
  applyADL,
  assertPerpStateSolvent,
  closePosition,
  processLiquidations,
} from 'common/perps/amm'
import { isPerpEscrowBalanced } from 'common/perps/escrow'
import {
  OraclePoint,
  decideOracleTransition,
  validateBasicOraclePoint,
} from 'common/perps/oracle'
import { PerpPosition } from 'common/perps/position'
import { Row } from 'common/supabase/utils'
import { HOUR_MS, YEAR_MS } from 'common/util/time'
import {
  BTC_USD_FEED_ID,
  ECI_FRONTIER_FEED_ID,
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  TRUMP_APPROVAL_FEED_ID,
  UK_GRID_CARBON_FEED_ID,
} from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import {
  PERP_LAUNCH_MARKETS,
  PerpLaunchMarketDefinition,
  getPerpLaunchCreatorId,
  getPerpLaunchManifestErrors,
  getPerpLaunchTopicSlug,
} from 'shared/perps/launch-manifest'
import { rowToPosition } from 'shared/perps/queries'
import { SupabaseDirectClientTimeout } from 'shared/supabase/init'
import {
  generateContractEmbeddings,
  updateContract,
} from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// DEV-only, idempotent replacement of pinned non-pristine launch prototypes
// plus retirement of the excluded ECI prototype.
//
// The default invocation is read-only. It prints the exact contract ids,
// immutable oracle points, position payouts, pool residuals, and user balances
// that an apply run would affect:
//
//   $env:NEXT_PUBLIC_FIREBASE_ENV = 'DEV'
//   npx.cmd ts-node rebuild-perp-launch-dev.ts
//
// Applying requires both flags:
//
//   $env:NEXT_PUBLIC_FIREBASE_ENV = 'DEV'
//   npx.cmd ts-node rebuild-perp-launch-dev.ts `
//     --apply --confirm=RETIRE-LEGACY-DEV-PERPS
//
// Safety order:
//   1. validate the DEV/Firebase identity and every pinned legacy market;
//   2. create or reuse all three clean, unlisted replacements;
//   3. repair and validate every replacement, including discovery;
//   4. only after all replacements pass, retire the four legacy markets;
//   5. run the normal resolution continuation (notifications/cache updates);
//   6. verify the final unresolved launch set and report balance deltas.
//
// A creation, topic, or embedding failure therefore cannot retire a legacy
// market. A partial apply is safely rerunnable: exact replacement candidates
// are reused, already-resolved legacy rows are skipped, and any ambiguous
// unresolved market aborts the script.

const APPLY_CONFIRMATION = 'RETIRE-LEGACY-DEV-PERPS'
const DEV_MANIFOLD = getPerpLaunchCreatorId('DEV')

type RebuildPlan = {
  feedId:
    | typeof BTC_USD_FEED_ID
    | typeof UK_GRID_CARBON_FEED_ID
    | typeof TRUMP_APPROVAL_FEED_ID
    | typeof OPENROUTER_OPEN_WEIGHT_FEED_ID
  legacyContractId: string
  legacySlug: string
  description: string
  // Each slug is an explicitly approved, semantically equivalent market on
  // the same oracle feed. A required-topic vector is allowed only as a final,
  // explicitly logged DEV fallback when no such market vector exists.
  embeddingFallbackSlugs: readonly string[]
}

type RetirePlan = {
  feedId: typeof ECI_FRONTIER_FEED_ID
  legacyContractId: string
  legacySlug: string
}

const REBUILD_PLANS: readonly RebuildPlan[] = [
  {
    feedId: BTC_USD_FEED_ID,
    legacyContractId: 'ZucCZdUg6cZR',
    legacySlug: 'bitcoin-price-usd',
    description:
      'Tracks BTC/USD spot using the median price across Coinbase, Kraken, and Bitstamp.',
    embeddingFallbackSlugs: ['bitcoin-price-usd', 'bitcoin-usd-perpetual'],
  },
  {
    feedId: UK_GRID_CARBON_FEED_ID,
    legacyContractId: 'SSyOOz9ldQu5',
    legacySlug: 'uk-grid-carbon-intensity-gco2kwh-pe',
    description:
      'Tracks finalized 30-minute UK grid carbon intensity actuals from NESO, measured in grams of CO₂ per kilowatt-hour.',
    embeddingFallbackSlugs: ['uk-grid-carbon-intensity-gco2kwh-pe'],
  },
  {
    feedId: TRUMP_APPROVAL_FEED_ID,
    legacyContractId: 'LCOhny065NRg',
    legacySlug: 'trump-approval-rating-EhsE',
    description:
      "Tracks the 14-day rolling average of Donald Trump's approval rating from VoteHub polls.",
    // The first slug is the current prototype. The second is its resolved
    // predecessor from the same feed and with the same underlying.
    embeddingFallbackSlugs: [
      'trump-approval-rating-EhsE',
      'trump-approval-rating',
    ],
  },
  {
    feedId: OPENROUTER_OPEN_WEIGHT_FEED_ID,
    legacyContractId: '8AguZ5yULcNQ',
    legacySlug: 'open-vs-closed-ai-openweight-share',
    description:
      'Tracks the trailing seven-day share of classified top-50 model tokens served by open-weight models on OpenRouter. OpenRouter publishes complete UTC days, so the value normally changes in daily steps.',
    embeddingFallbackSlugs: ['open-vs-closed-ai-openweight-share'],
  },
]

const RETIRE_PLANS: readonly RetirePlan[] = [
  {
    feedId: ECI_FRONTIER_FEED_ID,
    legacyContractId: 'dC98lsd0tP5Z',
    legacySlug: 'epoch-ai-capabilities-index-frontie',
  },
]

type ContractRow = {
  id: string
  data: PerpContract
  token: string | null
  resolution_time: string | null
}

type LatestOracleRow = {
  ts: string
  price: number | string
  source_ts: string | null
}

type DiscoverySnapshot = {
  group_slugs: string[]
  has_embedding: boolean
}

type BalanceRow = {
  id: string
  username: string
  balance: number | string
}

type SettlementLine = {
  userId: string
  direction: 'long' | 'short'
  originalCostBasis: number
  payout: number
  pnl: number
  disposition: 'liquidated' | 'adl-settled' | 'closed'
}

type SettlementPreview = {
  finalPoint: OraclePoint
  startingPool: { L: number; S: number }
  endingPool: { L: number; S: number }
  positions: PerpPosition[]
  settlements: SettlementLine[]
  residualPayout: number
  adlFactorLong: number
  adlFactorShort: number
}

type LegacySnapshot = {
  plan: RebuildPlan | RetirePlan
  row: ContractRow
  contract: PerpContract
  preview?: SettlementPreview
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const confirmation = args.find((arg) => arg.startsWith('--confirm='))
const allowedArgs = new Set(['--apply', `--confirm=${APPLY_CONFIRMATION}`])
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg))
if (unknownArgs.length > 0)
  throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`)
if (apply && confirmation !== `--confirm=${APPLY_CONFIRMATION}`)
  throw new Error(
    `Applying requires --confirm=${APPLY_CONFIRMATION}; no writes were attempted`
  )
if (!apply && confirmation)
  throw new Error('--confirm is only valid together with --apply')

const scriptAuth: AuthedUser = {
  uid: DEV_MANIFOLD,
  creds: {
    kind: 'jwt',
    data: {
      user_id: DEV_MANIFOLD,
    } as unknown as admin.auth.DecodedIdToken,
  },
}
const scriptRequest = {} as Request

const asErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const formatMana = (value: number) =>
  Number.isFinite(value)
    ? `M$${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      })}`
    : `M$${value}`

const asPerpContract = (row: ContractRow): PerpContract => {
  if (row.token !== 'MANA')
    throw new Error(`${row.id} has token ${row.token ?? 'null'}, expected MANA`)
  const contract: PerpContract = { ...row.data, token: 'MANA' }
  if (contract.mechanism !== 'perp' || contract.outcomeType !== 'PERP')
    throw new Error(
      `${row.id} is ${contract.mechanism}/${contract.outcomeType}, expected perp/PERP`
    )
  return contract
}

const assertExactNumber = (
  actual: number | undefined,
  expected: number,
  label: string
) => {
  if (!Number.isFinite(actual) || actual !== expected)
    throw new Error(`${label} is ${actual ?? 'missing'}, expected ${expected}`)
}

const getLaunchDefinition = (feedId: string) => {
  const definition = PERP_LAUNCH_MARKETS.find(
    (market) => market.feedId === feedId
  )
  if (!definition)
    throw new Error(`${feedId} is missing from the PERP launch manifest`)
  return definition
}

const getLaunchEconomics = (definition: PerpLaunchMarketDefinition) => {
  const feed = getOracleFeed(definition.feedId)
  if (!feed)
    throw new Error(`${definition.feedId} is missing from the feed registry`)
  if (!Number.isFinite(feed.updatePeriodMs) || feed.updatePeriodMs <= 0)
    throw new Error(
      `${definition.feedId} has invalid updatePeriodMs ${feed.updatePeriodMs}`
    )
  const fundingPeriodMs = Math.max(HOUR_MS, feed.updatePeriodMs)
  const maxFundingRate =
    definition.recommended.annualMaxFundingRate / (YEAR_MS / fundingPeriodMs)
  if (!Number.isFinite(maxFundingRate) || maxFundingRate <= 0)
    throw new Error(`${definition.feedId} produced invalid maxFundingRate`)
  return { feed, fundingPeriodMs, maxFundingRate }
}

const loadPositions = async (
  pg: SupabaseDirectClientTimeout,
  contractId: string
) => {
  const rows = await pg.manyOrNone<Row<'contract_perp_positions'>>(
    `select *
     from contract_perp_positions
     where contract_id = $1
     order by user_id, direction`,
    [contractId]
  )
  return rows.map(rowToPosition)
}

const getEscrowBalance = async (
  pg: SupabaseDirectClientTimeout,
  contractId: string
) => {
  const row = await pg.one<{ balance: number | string }>(
    `select (
       coalesce(sum(
         case when to_type = 'CONTRACT' and to_id = $1
           then amount else 0 end
       ), 0)
       -
       coalesce(sum(
         case when from_type = 'CONTRACT' and from_id = $1
           then amount else 0 end
       ), 0)
     ) as balance
     from txns
     where token = 'M$'
       and (
         (to_type = 'CONTRACT' and to_id = $1)
         or (from_type = 'CONTRACT' and from_id = $1)
       )`,
    [contractId]
  )
  const balance = Number(row.balance)
  if (!Number.isFinite(balance))
    throw new Error(`${contractId} has invalid escrow balance ${row.balance}`)
  return balance
}

const getFinalOraclePoint = async (
  pg: SupabaseDirectClientTimeout,
  contract: PerpContract
) => {
  const feed = getOracleFeed(contract.oracleFeedId)
  if (!feed)
    throw new Error(
      `${contract.oracleFeedId} is missing from the feed registry`
    )
  const latest = await pg.oneOrNone<LatestOracleRow>(
    `select ts, price, source_ts
     from oracle_prices
     where feed_id = $1
     order by ts desc
     limit 1`,
    [contract.oracleFeedId]
  )
  if (!latest)
    throw new Error(`${contract.oracleFeedId} has no published oracle point`)

  const sourceTs =
    latest.source_ts == null ? undefined : new Date(latest.source_ts).getTime()
  const latestPoint: OraclePoint = {
    ts: new Date(latest.ts).getTime(),
    price: Number(latest.price),
    ...(sourceTs == null ? {} : { sourceTs }),
  }
  const rejection =
    validateBasicOraclePoint(latestPoint) ??
    validateOraclePoint(feed, null, latestPoint)
  if (rejection)
    throw new Error(
      `${contract.oracleFeedId} latest oracle point is invalid: ${rejection}`
    )

  const cachedPoint: OraclePoint = {
    ts: contract.oraclePriceTime ?? 0,
    price: contract.oraclePrice,
    ...(contract.oracleSourceTime == null
      ? {}
      : { sourceTs: contract.oracleSourceTime }),
  }
  const decision = decideOracleTransition(cachedPoint, latestPoint)
  if (decision.action === 'reject')
    throw new Error(
      `${contract.slug} oracle transition would reject: ${decision.reason}`
    )
  if (decision.action === 'ignore' && decision.reason === 'stale')
    throw new Error(
      `${contract.slug} cache ${cachedPoint.ts} is newer than feed ${latestPoint.ts}`
    )
  return decision.action === 'apply' ? latestPoint : cachedPoint
}

const previewSettlement = (
  contract: PerpContract,
  positions: PerpPosition[],
  finalPoint: OraclePoint
): SettlementPreview => {
  const startingPool = { L: contract.poolLong, S: contract.poolShort }
  const startingState = { pool: startingPool, positions }
  const liquidation = processLiquidations(startingState, finalPoint.price)
  const adl = applyADL(liquidation.state, finalPoint.price)
  assertPerpStateSolvent(adl.state, finalPoint.price)

  const settlements: SettlementLine[] = liquidation.liquidated.map(
    (position) => ({
      userId: position.userId,
      direction: position.direction,
      originalCostBasis: position.originalCostBasis,
      payout: 0,
      pnl: -position.originalCostBasis,
      disposition: 'liquidated',
    })
  )
  settlements.push(
    ...adl.settled.map(({ position, payout }) => ({
      userId: position.userId,
      direction: position.direction,
      originalCostBasis: position.originalCostBasis,
      payout,
      pnl: payout - position.originalCostBasis,
      disposition: 'adl-settled' as const,
    }))
  )

  let runningState = adl.state
  for (const position of adl.state.positions) {
    if (position.size <= 0) continue
    const result = closePosition(runningState, position, finalPoint.price)
    runningState = result.state
    assertPerpStateSolvent(runningState, finalPoint.price)
    settlements.push({
      userId: position.userId,
      direction: position.direction,
      originalCostBasis: position.originalCostBasis,
      payout: result.payout,
      pnl: result.payout - position.originalCostBasis,
      disposition: 'closed',
    })
  }

  const residualPayout = Math.max(runningState.pool.L + runningState.pool.S, 0)
  if (!Number.isFinite(residualPayout))
    throw new Error(`${contract.slug} produced a non-finite residual payout`)
  return {
    finalPoint,
    startingPool,
    endingPool: runningState.pool,
    positions,
    settlements,
    residualPayout,
    adlFactorLong: adl.adlFactorLong,
    adlFactorShort: adl.adlFactorShort,
  }
}

const loadLegacySnapshot = async (
  pg: SupabaseDirectClientTimeout,
  plan: RebuildPlan | RetirePlan
): Promise<LegacySnapshot> => {
  const row = await pg.oneOrNone<ContractRow>(
    `select id, data, token, resolution_time
     from contracts
     where id = $1`,
    [plan.legacyContractId]
  )
  if (!row)
    throw new Error(
      `pinned legacy contract ${plan.legacyContractId} does not exist`
    )
  const contract = asPerpContract(row)
  if (
    contract.slug !== plan.legacySlug ||
    contract.id !== plan.legacyContractId ||
    contract.oracleFeedId !== plan.feedId ||
    contract.creatorId !== DEV_MANIFOLD
  )
    throw new Error(
      `legacy identity mismatch for ${plan.legacySlug}: ` +
        `${contract.id}/${contract.oracleFeedId}/${contract.creatorId}`
    )
  const resolvedInData = contract.isResolved === true
  const resolvedInColumn = row.resolution_time != null
  if (resolvedInData !== resolvedInColumn)
    throw new Error(
      `${contract.slug} resolution state disagrees between data and native column`
    )

  const positions = await loadPositions(pg, contract.id)
  const escrow = await getEscrowBalance(pg, contract.id)
  if (
    !isPerpEscrowBalanced({
      ledgerBalance: escrow,
      poolLong: contract.poolLong,
      poolShort: contract.poolShort,
    })
  )
    throw new Error(
      `${contract.slug} escrow mismatch: ledger=${escrow}, pools=${
        contract.poolLong + contract.poolShort
      }`
    )

  if (resolvedInColumn) {
    if (
      positions.length !== 0 ||
      contract.poolLong !== 0 ||
      contract.poolShort !== 0
    )
      throw new Error(
        `${contract.slug} is resolved but retains positions or pool balance`
      )
    return { plan, row, contract }
  }

  const finalPoint = await getFinalOraclePoint(pg, contract)
  const preview = previewSettlement(contract, positions, finalPoint)
  return { plan, row, contract, preview }
}

const logLegacySnapshot = (snapshot: LegacySnapshot) => {
  const { contract, preview, row } = snapshot
  if (!preview) {
    log(`SKIP RETIRE: ${contract.slug} (${row.id}) is already resolved`)
    return
  }
  const ageHours = (Date.now() - preview.finalPoint.ts) / HOUR_MS
  log(
    `RETIRE: ${contract.slug} (${row.id}) feed=${contract.oracleFeedId} ` +
      `at ${preview.finalPoint.price} / ${new Date(
        preview.finalPoint.ts
      ).toISOString()} (${ageHours.toFixed(1)}h old)`
  )
  log(
    `  pools L=${formatMana(preview.startingPool.L)} ` +
      `S=${formatMana(preview.startingPool.S)}; ` +
      `${preview.positions.length} open position(s); ` +
      `ADL factors L=${preview.adlFactorLong}, S=${preview.adlFactorShort}`
  )
  for (const settlement of preview.settlements)
    log(
      `  ${settlement.userId} ${settlement.direction} ` +
        `${settlement.disposition}: invested=${formatMana(
          settlement.originalCostBasis
        )}, payout=${formatMana(settlement.payout)}, ` +
        `PnL=${formatMana(settlement.pnl)}`
    )
  log(
    `  creator residual=${formatMana(
      preview.residualPayout
    )}; ending pools before residual L=${formatMana(
      preview.endingPool.L
    )}, S=${formatMana(preview.endingPool.S)}`
  )
}

const getUnresolvedForFeed = async (
  pg: SupabaseDirectClientTimeout,
  feedId: string
) =>
  await pg.manyOrNone<ContractRow>(
    `select id, data, token, resolution_time
     from contracts
     where resolution_time is null
       and data->>'oracleFeedId' = $1
     order by created_time`,
    [feedId]
  )

const findReplacement = async (
  pg: SupabaseDirectClientTimeout,
  plan: RebuildPlan,
  legacyId: string
) => {
  const definition = getLaunchDefinition(plan.feedId)
  const unresolved = await getUnresolvedForFeed(pg, plan.feedId)
  const unexpected = unresolved.filter((row) => {
    if (row.id === legacyId) return false
    const contract = asPerpContract(row)
    return (
      contract.question !== definition.question ||
      contract.creatorId !== DEV_MANIFOLD
    )
  })
  if (unexpected.length > 0)
    throw new Error(
      `${plan.feedId} has unexpected unresolved market(s): ${unexpected
        .map((row) => `${row.id}/${row.data.slug}/${row.data.question}`)
        .join(', ')}`
    )
  const replacements = unresolved.filter((row) => row.id !== legacyId)
  if (replacements.length > 1)
    throw new Error(
      `${plan.feedId} has ${replacements.length} replacement candidates`
    )
  return replacements[0]
}

const validateReplacementConfig = async (
  pg: SupabaseDirectClientTimeout,
  row: ContractRow,
  definition: PerpLaunchMarketDefinition
) => {
  const contract = asPerpContract(row)
  const { fundingPeriodMs, maxFundingRate } = getLaunchEconomics(definition)
  if (row.resolution_time != null || contract.isResolved)
    throw new Error(`${contract.id} replacement is resolved`)
  if (
    contract.question !== definition.question ||
    contract.oracleFeedId !== definition.feedId ||
    contract.creatorId !== DEV_MANIFOLD
  )
    throw new Error(`${contract.id} replacement identity mismatch`)
  if (contract.visibility !== 'unlisted')
    throw new Error(
      `${contract.id} visibility is ${contract.visibility}, expected unlisted`
    )
  assertExactNumber(
    contract.maxLeverage,
    definition.recommended.maxLeverage,
    `${contract.slug} maxLeverage`
  )
  assertExactNumber(
    contract.maxFundingRate,
    maxFundingRate,
    `${contract.slug} maxFundingRate`
  )
  assertExactNumber(
    contract.fundingSensitivity,
    definition.recommended.fundingSensitivity,
    `${contract.slug} fundingSensitivity`
  )
  assertExactNumber(
    contract.maxOraclePriceAgeMs,
    definition.recommended.maxOraclePriceAgeMs,
    `${contract.slug} maxOraclePriceAgeMs`
  )
  assertExactNumber(
    contract.fundingPeriodMs,
    fundingPeriodMs,
    `${contract.slug} fundingPeriodMs`
  )
  assertExactNumber(
    contract.initialPoolLong,
    definition.recommended.subsidyLong,
    `${contract.slug} initialPoolLong`
  )
  assertExactNumber(
    contract.initialPoolShort,
    definition.recommended.subsidyShort,
    `${contract.slug} initialPoolShort`
  )
  assertExactNumber(
    contract.initialSubsidy,
    definition.recommended.subsidyLong + definition.recommended.subsidyShort,
    `${contract.slug} initialSubsidy`
  )

  const positions = await loadPositions(pg, contract.id)
  if (positions.length !== 0)
    throw new Error(
      `${contract.slug} replacement has ${positions.length} position(s)`
    )
  // A candidate that was traded and later flattened is not a clean launch
  // replacement: pool transfers would silently change the starting backing.
  assertExactNumber(
    contract.poolLong,
    definition.recommended.subsidyLong,
    `${contract.slug} current poolLong`
  )
  assertExactNumber(
    contract.poolShort,
    definition.recommended.subsidyShort,
    `${contract.slug} current poolShort`
  )

  const escrow = await getEscrowBalance(pg, contract.id)
  if (
    !isPerpEscrowBalanced({
      ledgerBalance: escrow,
      poolLong: contract.poolLong,
      poolShort: contract.poolShort,
    })
  )
    throw new Error(
      `${contract.slug} replacement escrow mismatch: ledger=${escrow}`
    )
  assertPerpStateSolvent(
    {
      pool: { L: contract.poolLong, S: contract.poolShort },
      positions,
    },
    contract.oraclePrice
  )
  const oracleRejection = validateBasicOraclePoint({
    price: contract.oraclePrice,
    ts: contract.oraclePriceTime ?? 0,
    ...(contract.oracleSourceTime == null
      ? {}
      : { sourceTs: contract.oracleSourceTime }),
  })
  if (oracleRejection)
    throw new Error(
      `${contract.slug} cached oracle point is invalid: ${oracleRejection}`
    )
  return contract
}

const getDiscoverySnapshot = async (
  pg: SupabaseDirectClientTimeout,
  contractId: string
) =>
  await pg.one<DiscoverySnapshot>(
    `select
       array(
         select g.slug
         from group_contracts gc
         join groups g on g.id = gc.group_id
         where gc.contract_id = $1
       ) as group_slugs,
       exists(
         select 1
         from contract_embeddings
         where contract_id = $1
       ) as has_embedding`,
    [contractId]
  )

const findApprovedEmbeddingSource = async (
  pg: SupabaseDirectClientTimeout,
  plan: RebuildPlan
) =>
  await pg.oneOrNone<{ id: string; slug: string }>(
    `select c.id, c.slug
     from contracts c
     join contract_embeddings e on e.contract_id = c.id
     where c.slug = any($1::text[])
       and c.data->>'oracleFeedId' = $2
       and c.data->>'creatorId' = $3
       and c.mechanism = 'perp'
     order by array_position($1::text[], c.slug)
     limit 1`,
    [plan.embeddingFallbackSlugs, plan.feedId, DEV_MANIFOLD]
  )

const findSameFeedEmbeddingSources = async (
  pg: SupabaseDirectClientTimeout,
  feedId: string
) =>
  await pg.manyOrNone<{ id: string; slug: string; question: string }>(
    `select c.id, c.slug, c.data->>'question' as question
     from contracts c
     join contract_embeddings e on e.contract_id = c.id
     where c.data->>'oracleFeedId' = $1
       and c.mechanism = 'perp'
     order by c.created_time`,
    [feedId]
  )

const getDevTopicEmbeddingSource = async (
  pg: SupabaseDirectClientTimeout,
  definition: PerpLaunchMarketDefinition
) => {
  if (ENV !== 'DEV')
    throw new Error('topic-vector embedding fallback is DEV-only')
  if (definition.requiredTopics.length !== 1)
    throw new Error(
      `${definition.feedId} has ${definition.requiredTopics.length} required ` +
        `topics; DEV fallback requires exactly one deterministic source`
    )
  const topic = definition.requiredTopics[0]
  const slug = getPerpLaunchTopicSlug(topic, 'DEV')
  const source = await pg.oneOrNone<{
    id: string
    slug: string
    name: string
  }>(
    `select g.id, g.slug, g.name
     from groups g
     join group_embeddings e on e.group_id = g.id
     where g.slug = $1`,
    [slug]
  )
  if (!source)
    throw new Error(
      `${definition.feedId} has no group_embeddings vector for required ` +
        `DEV topic ${topic.name} (${slug})`
    )
  return source
}

const logMissingEmbeddingFallback = async (
  pg: SupabaseDirectClientTimeout,
  plan: RebuildPlan,
  definition: PerpLaunchMarketDefinition
) => {
  const sameFeedSources = await findSameFeedEmbeddingSources(pg, plan.feedId)
  log.warn(
    `  no approved same-feed embedding fallback; unapproved market vectors ` +
      `will not be reused`
  )
  if (sameFeedSources.length === 0)
    log.warn(`  ${plan.feedId} has no stored same-feed embeddings at all`)
  else
    log.warn(
      `  unapproved same-feed vector(s) intentionally ignored: ${sameFeedSources
        .map((source) => `${source.slug} (${source.id}, "${source.question}")`)
        .join(', ')}`
    )
  const topicSource = await getDevTopicEmbeddingSource(pg, definition)
  log.warn(
    `  DEV-only coarse topic fallback available: ${topicSource.name} ` +
      `(${topicSource.slug}, ${topicSource.id})`
  )
}

const ensureReplacementDiscovery = async (
  pg: SupabaseDirectClientTimeout,
  contract: PerpContract,
  plan: RebuildPlan,
  definition: PerpLaunchMarketDefinition
) => {
  const requiredTopicSlugs = definition.requiredTopics.map((topic) =>
    getPerpLaunchTopicSlug(topic, 'DEV')
  )
  const requiredGroups = await pg.manyOrNone<{ id: string; slug: string }>(
    `select id, slug
     from groups
     where slug = any($1::text[])`,
    [requiredTopicSlugs]
  )
  if (requiredGroups.length !== requiredTopicSlugs.length)
    throw new Error(
      `${definition.feedId} expected ${requiredTopicSlugs.length} topic(s), ` +
        `found ${requiredGroups.length}`
    )

  let currentContract = contract
  let discovery = await getDiscoverySnapshot(pg, contract.id)
  for (const group of requiredGroups) {
    if (
      discovery.group_slugs.includes(group.slug) &&
      (currentContract.groupSlugs ?? []).includes(group.slug)
    )
      continue
    await pg.tx(async (tx) => {
      await tx.none(
        `delete from group_contracts
         where contract_id = $1 and group_id = $2`,
        [contract.id, group.id]
      )
      await updateContract(tx, contract.id, {
        groupSlugs: FieldVal.arrayRemove(group.slug),
      })
      await addGroupToContract(tx, currentContract, group)
    })
    log(`normalized ${contract.slug} topic ${group.slug}`)
    const refreshed = await pg.one<ContractRow>(
      `select id, data, token, resolution_time
       from contracts
       where id = $1`,
      [contract.id]
    )
    currentContract = asPerpContract(refreshed)
    discovery = await getDiscoverySnapshot(pg, contract.id)
  }

  if (!discovery.has_embedding) {
    try {
      await generateContractEmbeddings(currentContract, pg)
    } catch (error) {
      log.warn(
        `embedding generation failed for ${
          currentContract.slug
        }: ${asErrorMessage(error)}`
      )
    }
    discovery = await getDiscoverySnapshot(pg, contract.id)
  }

  if (!discovery.has_embedding) {
    const source = await findApprovedEmbeddingSource(pg, plan)
    if (source) {
      await pg.none(
        `insert into contract_embeddings (contract_id, embedding)
         select $1, embedding
         from contract_embeddings
         where contract_id = $2
         on conflict (contract_id) do nothing`,
        [contract.id, source.id]
      )
      log(
        `reused semantically equivalent ${source.slug} (${source.id}) ` +
          `embedding for ${currentContract.slug}`
      )
    } else {
      const topicSource = await getDevTopicEmbeddingSource(pg, definition)
      await pg.none(
        `insert into contract_embeddings (contract_id, embedding)
         select $1, embedding
         from group_embeddings
         where group_id = $2
         on conflict (contract_id) do nothing`,
        [contract.id, topicSource.id]
      )
      log.warn(
        `used DEV-only coarse ${topicSource.name} topic embedding ` +
          `(${topicSource.slug}, ${topicSource.id}) for ${currentContract.slug}`
      )
    }
    discovery = await getDiscoverySnapshot(pg, contract.id)
  }

  const missingTopic = requiredTopicSlugs.find(
    (slug) =>
      !discovery.group_slugs.includes(slug) ||
      !(currentContract.groupSlugs ?? []).includes(slug)
  )
  if (missingTopic)
    throw new Error(
      `${currentContract.slug} is missing topic ${missingTopic} ` +
        `from its join or cached slugs`
    )
  if (!discovery.has_embedding)
    throw new Error(`${currentContract.slug} discovery embedding is missing`)
  return currentContract
}

const inspectReplacementDiscovery = async (
  pg: SupabaseDirectClientTimeout,
  contract: PerpContract,
  definition: PerpLaunchMarketDefinition
) => {
  const discovery = await getDiscoverySnapshot(pg, contract.id)
  const requiredTopicSlugs = definition.requiredTopics.map((topic) =>
    getPerpLaunchTopicSlug(topic, 'DEV')
  )
  const missingTopics = requiredTopicSlugs.filter(
    (slug) =>
      !discovery.group_slugs.includes(slug) ||
      !(contract.groupSlugs ?? []).includes(slug)
  )
  return {
    missingTopics,
    hasEmbedding: discovery.has_embedding,
  }
}

const validateCleanLaunchContract = async (
  pg: SupabaseDirectClientTimeout,
  row: ContractRow,
  definition: PerpLaunchMarketDefinition
) => {
  const contract = await validateReplacementConfig(pg, row, definition)
  const discovery = await inspectReplacementDiscovery(pg, contract, definition)
  if (discovery.missingTopics.length > 0 || !discovery.hasEmbedding)
    throw new Error(
      `${contract.slug} discovery is incomplete: missing topics=${
        discovery.missingTopics.join(', ') || 'none'
      }, embedding=${discovery.hasEmbedding ? 'ready' : 'missing'}`
    )
  return contract
}

const snapshotBalances = async (
  pg: SupabaseDirectClientTimeout,
  userIds: string[]
) => {
  if (userIds.length === 0) return new Map<string, BalanceRow>()
  const rows = await pg.manyOrNone<BalanceRow>(
    `select id, username, balance
     from users
     where id = any($1::text[])`,
    [userIds]
  )
  if (rows.length !== userIds.length) {
    const found = rows.map((row) => row.id)
    const missing = userIds.filter((id) => !found.includes(id))
    throw new Error(`missing balance row(s) for ${missing.join(', ')}`)
  }
  return new Map(rows.map((row) => [row.id, row]))
}

const logBalances = (
  label: string,
  userIds: string[],
  balances: Map<string, BalanceRow>,
  before?: Map<string, BalanceRow>
) => {
  log(label)
  for (const userId of userIds) {
    const row = balances.get(userId)
    if (!row) continue
    const current = Number(row.balance)
    const previous = before?.get(userId)
    const delta = previous ? current - Number(previous.balance) : undefined
    log(
      `  ${row.username} (${userId}): ${formatMana(current)}` +
        (delta == null ? '' : `; delta=${formatMana(delta)}`)
    )
  }
}

const addBalanceDelta = (
  deltas: Map<string, number>,
  userId: string,
  amount: number
) => {
  if (!Number.isFinite(amount))
    throw new Error(`non-finite projected balance delta for ${userId}`)
  deltas.set(userId, (deltas.get(userId) ?? 0) + amount)
}

const logProjectedBalanceDeltas = (
  userIds: string[],
  balances: Map<string, BalanceRow>,
  deltas: Map<string, number>
) => {
  log('PROJECTED USER BALANCE DELTAS')
  for (const userId of userIds) {
    const row = balances.get(userId)
    const delta = deltas.get(userId) ?? 0
    if (!row) continue
    log(
      `  ${row.username} (${userId}): delta=${formatMana(delta)}, ` +
        `projected balance=${formatMana(Number(row.balance) + delta)}`
    )
  }
}

const verifyResolvedLegacy = async (
  pg: SupabaseDirectClientTimeout,
  contractId: string
) => {
  const [row, resolutionEdit] = await Promise.all([
    pg.one<ContractRow>(
      `select id, data, token, resolution_time
       from contracts
       where id = $1`,
      [contractId]
    ),
    pg.oneOrNone(
      `select 1
       from contract_edits
       where contract_id = $1
         and editor_id = $2
         and updated_keys @> array[
           'isResolved',
           'resolvedOraclePrice'
         ]::text[]
       order by created_time desc
       limit 1`,
      [contractId, DEV_MANIFOLD]
    ),
  ])
  const contract = asPerpContract(row)
  const positions = await loadPositions(pg, contractId)
  const escrow = await getEscrowBalance(pg, contractId)
  if (
    row.resolution_time == null ||
    !contract.isResolved ||
    positions.length !== 0 ||
    contract.poolLong !== 0 ||
    contract.poolShort !== 0 ||
    !isPerpEscrowBalanced({
      ledgerBalance: escrow,
      poolLong: 0,
      poolShort: 0,
    })
  )
    throw new Error(`${contract.slug} failed post-resolution verification`)
  if (!resolutionEdit)
    throw new Error(
      `${contract.slug} resolved financially, but its resolution edit-history continuation is missing`
    )
}

const verifyFinalUnresolvedSet = async (
  pg: SupabaseDirectClientTimeout,
  replacementIds: string[]
) => {
  const unresolved = await pg.manyOrNone<ContractRow>(
    `select id, data, token, resolution_time
     from contracts
     where mechanism = 'perp'
       and resolution_time is null
     order by data->>'oracleFeedId', created_time`
  )
  const manifestFeedIds = PERP_LAUNCH_MARKETS.map((market) => market.feedId)
  const outsideManifest = unresolved.filter(
    (row) => !manifestFeedIds.includes(row.data.oracleFeedId)
  )
  if (outsideManifest.length > 0)
    throw new Error(
      `unresolved out-of-manifest PERP(s): ${outsideManifest
        .map((row) => `${row.id}/${row.data.slug}/${row.data.oracleFeedId}`)
        .join(', ')}`
    )
  for (const definition of PERP_LAUNCH_MARKETS) {
    const matches = unresolved.filter(
      (row) => row.data.oracleFeedId === definition.feedId
    )
    if (matches.length !== 1)
      throw new Error(
        `${definition.feedId} has ${matches.length} unresolved markets, expected 1`
      )
    const contract = await validateCleanLaunchContract(
      pg,
      matches[0],
      definition
    )
    if (
      contract.question !== definition.question ||
      contract.creatorId !== DEV_MANIFOLD ||
      contract.visibility !== 'unlisted'
    )
      throw new Error(
        `${definition.feedId} final unresolved market failed identity/visibility`
      )
  }
  const missingReplacement = replacementIds.find(
    (id) => !unresolved.some((row) => row.id === id)
  )
  if (missingReplacement)
    throw new Error(
      `replacement ${missingReplacement} is absent from final unresolved set`
    )
  log(
    `FINAL: exactly ${PERP_LAUNCH_MARKETS.length} unlisted manifest PERPs ` +
      `remain unresolved; ECI and all out-of-manifest PERPs are retired`
  )
}

if (require.main === module)
  runScript(async ({ pg }) => {
    const projectId = admin.app().options.projectId
    if (
      ENV !== 'DEV' ||
      projectId !== ENV_CONFIG.firebaseConfig.projectId ||
      projectId !== 'dev-mantic-markets'
    )
      throw new Error(
        `DEV guard failed (ENV=${ENV}, Firebase=${projectId ?? 'missing'})`
      )
    const manifestErrors = getPerpLaunchManifestErrors()
    if (manifestErrors.length > 0)
      throw new Error(
        `launch manifest is invalid:\n- ${manifestErrors.join('\n- ')}`
      )

    log(
      apply
        ? `APPLY MODE confirmed with ${APPLY_CONFIRMATION}`
        : 'DRY RUN: read-only; no contracts, balances, topics, or embeddings will change'
    )

    let legacySnapshots = await Promise.all(
      [...REBUILD_PLANS, ...RETIRE_PLANS].map((plan) =>
        loadLegacySnapshot(pg, plan)
      )
    )
    legacySnapshots.forEach(logLegacySnapshot)

    // Refuse to operate in an ambiguous dataset before creating anything.
    const knownLegacyIds = legacySnapshots.map((snapshot) => snapshot.row.id)
    const unresolvedBefore = await pg.manyOrNone<ContractRow>(
      `select id, data, token, resolution_time
       from contracts
       where mechanism = 'perp'
         and resolution_time is null
       order by created_time`
    )
    const recognizedBefore = unresolvedBefore.filter((row) => {
      if (knownLegacyIds.includes(row.id)) return true
      const definition = PERP_LAUNCH_MARKETS.find(
        (market) => market.feedId === row.data.oracleFeedId
      )
      return (
        definition != null &&
        row.data.question === definition.question &&
        row.data.creatorId === DEV_MANIFOLD
      )
    })
    if (recognizedBefore.length !== unresolvedBefore.length) {
      const unexpected = unresolvedBefore.filter(
        (row) => !recognizedBefore.some((known) => known.id === row.id)
      )
      throw new Error(
        `unexpected unresolved PERP(s) before rebuild: ${unexpected
          .map((row) => `${row.id}/${row.data.slug}/${row.data.oracleFeedId}`)
          .join(', ')}`
      )
    }

    let trackedUserIds = uniq([
      DEV_MANIFOLD,
      ...legacySnapshots.flatMap(
        (snapshot) =>
          snapshot.preview?.positions.map((position) => position.userId) ?? []
      ),
    ])
    const balancesBefore = await snapshotBalances(pg, trackedUserIds)
    logBalances('PRE-RUN USER BALANCES', trackedUserIds, balancesBefore)
    const projectedBalanceDeltas = new Map<string, number>()
    for (const snapshot of legacySnapshots) {
      if (!snapshot.preview) continue
      addBalanceDelta(
        projectedBalanceDeltas,
        snapshot.contract.creatorId,
        snapshot.preview.residualPayout
      )
      for (const settlement of snapshot.preview.settlements)
        addBalanceDelta(
          projectedBalanceDeltas,
          settlement.userId,
          settlement.payout
        )
    }

    const replacementIds: string[] = []
    const replacementRowsByFeed = new Map<string, ContractRow | null>()
    for (const plan of REBUILD_PLANS) {
      const legacy = legacySnapshots.find(
        (snapshot) => snapshot.plan.feedId === plan.feedId
      )
      if (!legacy) throw new Error(`${plan.feedId} legacy snapshot disappeared`)
      replacementRowsByFeed.set(
        plan.feedId,
        await findReplacement(pg, plan, legacy.row.id)
      )
    }
    const requiredBacking = REBUILD_PLANS.reduce((total, plan) => {
      if (replacementRowsByFeed.get(plan.feedId)) return total
      const definition = getLaunchDefinition(plan.feedId)
      return (
        total +
        definition.recommended.subsidyLong +
        definition.recommended.subsidyShort
      )
    }, 0)
    const creatorBalance = Number(balancesBefore.get(DEV_MANIFOLD)?.balance)
    if (!Number.isFinite(creatorBalance) || creatorBalance < requiredBacking)
      throw new Error(
        `creator balance ${formatMana(
          creatorBalance
        )} cannot fund aggregate missing replacement backing ${formatMana(
          requiredBacking
        )}`
      )
    log(
      `AGGREGATE FUNDING GATE: creator can fund ${formatMana(
        requiredBacking
      )} of missing replacement backing`
    )

    try {
      for (const plan of REBUILD_PLANS) {
        const definition = getLaunchDefinition(plan.feedId)
        const legacy = legacySnapshots.find(
          (snapshot) => snapshot.plan.feedId === plan.feedId
        )
        if (!legacy)
          throw new Error(`${plan.feedId} legacy snapshot disappeared`)
        let replacementRow = replacementRowsByFeed.get(plan.feedId) ?? null

        if (!replacementRow) {
          const { fundingPeriodMs, maxFundingRate } =
            getLaunchEconomics(definition)
          addBalanceDelta(
            projectedBalanceDeltas,
            DEV_MANIFOLD,
            -(
              definition.recommended.subsidyLong +
              definition.recommended.subsidyShort
            )
          )
          if (!apply) {
            const fallback = await findApprovedEmbeddingSource(pg, plan)
            log(
              `CREATE: ${definition.question} (${definition.feedId}), unlisted, ` +
                `${definition.recommended.maxLeverage}x, ` +
                `period=${fundingPeriodMs}ms, fMax=${maxFundingRate}, ` +
                `backing L=${formatMana(
                  definition.recommended.subsidyLong
                )}/S=${formatMana(definition.recommended.subsidyShort)}`
            )
            if (fallback)
              log(
                `  approved embedding fallback: ${fallback.slug} (${fallback.id})`
              )
            else await logMissingEmbeddingFallback(pg, plan, definition)
            continue
          }
          const created = await createPerp(
            {
              question: definition.question,
              description: plan.description,
              visibility: 'unlisted',
              oracleFeedId: definition.feedId,
              maxLeverage: definition.recommended.maxLeverage,
              maxFundingRate,
              fundingSensitivity: definition.recommended.fundingSensitivity,
              maxOraclePriceAgeMs: definition.recommended.maxOraclePriceAgeMs,
              subsidyLong: definition.recommended.subsidyLong,
              subsidyShort: definition.recommended.subsidyShort,
            },
            scriptAuth,
            scriptRequest
          )
          if (!created || !('result' in created) || !('continue' in created))
            throw new Error(
              `${definition.feedId} createPerp returned no continuation`
            )
          await created.continue()
          log(
            `created ${created.result.id} (${created.result.slug}); ` +
              `creation continuation complete`
          )
          replacementRow = await pg.one<ContractRow>(
            `select id, data, token, resolution_time
             from contracts
             where id = $1`,
            [created.result.id]
          )
        } else {
          log(
            `REUSE: ${replacementRow.id} (${replacementRow.data.slug}) ` +
              `for ${definition.feedId}`
          )
        }

        const replacement = await validateReplacementConfig(
          pg,
          replacementRow,
          definition
        )
        if (apply) {
          const discovered = await ensureReplacementDiscovery(
            pg,
            replacement,
            plan,
            definition
          )
          const refreshedRow = await pg.one<ContractRow>(
            `select id, data, token, resolution_time
             from contracts
             where id = $1`,
            [discovered.id]
          )
          await validateCleanLaunchContract(pg, refreshedRow, definition)
          log(
            `VALIDATED: ${discovered.slug} (${discovered.id}) is clean, ` +
              `unlisted, solvent, and discoverable`
          )
        } else {
          const discovery = await inspectReplacementDiscovery(
            pg,
            replacement,
            definition
          )
          log(
            `  discovery: topics=${
              discovery.missingTopics.length === 0
                ? 'ready'
                : `would repair ${discovery.missingTopics.join(', ')}`
            }, embedding=${
              discovery.hasEmbedding ? 'ready' : 'would generate/fallback'
            }`
          )
          if (!discovery.hasEmbedding) {
            const fallback = await findApprovedEmbeddingSource(pg, plan)
            if (fallback)
              log(
                `  approved embedding fallback: ${fallback.slug} (${fallback.id})`
              )
            else await logMissingEmbeddingFallback(pg, plan, definition)
          }
        }
        replacementIds.push(replacement.id)
      }

      logProjectedBalanceDeltas(
        trackedUserIds,
        balancesBefore,
        projectedBalanceDeltas
      )
      if (!apply) {
        log(
          `DRY RUN COMPLETE: rerun with --apply ` +
            `--confirm=${APPLY_CONFIRMATION} to execute this recorded plan`
        )
        return
      }

      if (replacementIds.length !== REBUILD_PLANS.length)
        throw new Error(
          `validated ${replacementIds.length} replacements, expected ${REBUILD_PLANS.length}`
        )

      // Re-read all legacy contracts immediately before retirement. This
      // captures any intervening trade in the printed settlement record and
      // lets the engine settle the locked current state atomically.
      legacySnapshots = await Promise.all(
        [...REBUILD_PLANS, ...RETIRE_PLANS].map((plan) =>
          loadLegacySnapshot(pg, plan)
        )
      )
      const finalPositionUserIds = uniq(
        legacySnapshots.flatMap(
          (snapshot) =>
            snapshot.preview?.positions.map((position) => position.userId) ?? []
        )
      )
      const lateUserIds = finalPositionUserIds.filter(
        (userId) => !trackedUserIds.includes(userId)
      )
      if (lateUserIds.length > 0) {
        const lateBalances = await snapshotBalances(pg, lateUserIds)
        for (const [userId, balance] of lateBalances)
          balancesBefore.set(userId, balance)
        trackedUserIds = uniq([...trackedUserIds, ...lateUserIds])
        log(
          `FINAL BALANCE AUDIT: added ${lateUserIds.length} trader(s) who ` +
            `opened positions after the initial snapshot`
        )
      }
      log('FINAL SETTLEMENT RECORD')
      legacySnapshots.forEach(logLegacySnapshot)

      // Revalidate every replacement after the final legacy snapshot and
      // immediately before the first retirement. The same full validation is
      // repeated after retirement by verifyFinalUnresolvedSet, so an
      // intervening trade cannot be reported as a clean launch state.
      for (const replacementId of replacementIds) {
        const replacementRow = await pg.one<ContractRow>(
          `select id, data, token, resolution_time
           from contracts
           where id = $1`,
          [replacementId]
        )
        const definition = getLaunchDefinition(replacementRow.data.oracleFeedId)
        await validateCleanLaunchContract(pg, replacementRow, definition)
      }
      log(
        `FINAL REPLACEMENT GATE: ${replacementIds.length} clean, unlisted, ` +
          `solvent, discoverable replacement(s) revalidated`
      )

      for (const snapshot of legacySnapshots) {
        if (!snapshot.preview) continue
        const response = await resolveMarketMain(
          { contractId: snapshot.contract.id, outcome: 'MKT' },
          scriptAuth,
          scriptRequest
        )
        if (!response || !('result' in response) || !('continue' in response))
          throw new Error(
            `${snapshot.contract.slug} resolution returned no continuation`
          )
        await response.continue()
        await verifyResolvedLegacy(pg, snapshot.contract.id)
        log(
          `RESOLVED: ${snapshot.contract.slug} (${snapshot.contract.id}); ` +
            `financial state and resolution edit history verified; the normal ` +
            `best-effort notification, broadcast, analytics, and cache ` +
            `continuation returned (individual failures remain ERROR-logged)`
        )
      }

      // Include rows that were already resolved by a partial prior run. If
      // settlement committed but its continuation failed, a rerun must not
      // silently skip the missing edit-history evidence.
      for (const snapshot of legacySnapshots)
        await verifyResolvedLegacy(pg, snapshot.contract.id)
      log(
        `FINAL RETIREMENT GATE: all ${legacySnapshots.length} pinned legacy ` +
          `PERPs have zero positions/escrow and verified resolution edit history`
      )

      await verifyFinalUnresolvedSet(pg, replacementIds)
    } finally {
      if (apply) {
        const balancesAfter = await snapshotBalances(pg, trackedUserIds)
        logBalances(
          'POST-RUN USER BALANCES',
          trackedUserIds,
          balancesAfter,
          balancesBefore
        )
      }
    }
  })
