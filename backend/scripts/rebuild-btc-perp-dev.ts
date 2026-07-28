import * as admin from 'firebase-admin'
import { Request } from 'express'

import { createPerp } from 'api/create-perp'
import { PerpContract } from 'common/contract'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { isPerpEscrowBalanced } from 'common/perps/escrow'
import { HOUR_MS, YEAR_MS } from 'common/util/time'
import { AuthedUser } from 'api/helpers/endpoint'
import { getOracleFeed } from 'shared/oracle-feeds'
import {
  PERP_LAUNCH_MARKETS,
  getPerpLaunchCreatorId,
  getPerpLaunchTopicSlug,
} from 'shared/perps/launch-manifest'
import { resolvePerp } from 'shared/perps/engine'
import {
  generateContractEmbeddings,
  updateContract,
} from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// One-shot, DEV-only repair for the legacy Bitcoin prototype. The old market
// froze obsolete 100x / high-funding economics before launch configuration
// became executable. Price history is feed-scoped, so a replacement inherits
// the full BTC chart while positions and funding accounting start clean.
//
// Safety order:
//   1. create and fully validate the unlisted replacement;
//   2. recheck that the old market still has zero positions;
//   3. only then resolve the old market.
//
// A failed creation/discovery follow-up therefore leaves the old public
// prototype intact. A concurrent old-market trade aborts retirement.

const OLD_CONTRACT_ID = 'OE6uhhZQpI8R'
const FEED_ID = 'btc-usd'
const DEV_MANIFOLD = getPerpLaunchCreatorId('DEV')
const launchDefinition = PERP_LAUNCH_MARKETS.find(
  (market) => market.feedId === FEED_ID
)
const feedDefinition = getOracleFeed(FEED_ID)

if (!launchDefinition)
  throw new Error(`${FEED_ID} is missing from the PERP launch manifest`)
if (!feedDefinition)
  throw new Error(`${FEED_ID} is missing from the oracle feed registry`)

const fundingPeriodMs = Math.max(HOUR_MS, feedDefinition.updatePeriodMs)
const maxFundingRate =
  launchDefinition.recommended.annualMaxFundingRate /
  (YEAR_MS / fundingPeriodMs)

type ContractRow = {
  id: string
  data: PerpContract
  token: string | null
  resolution_time: string | null
}

type DiscoveryRow = {
  group_slugs: string[]
  has_embedding: boolean
}

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

const asPerpContract = (row: ContractRow): PerpContract => {
  if (row.token !== 'MANA')
    throw new Error(`${row.id} has token ${row.token ?? 'null'}, expected MANA`)
  return { ...row.data, token: row.token }
}

const assertExactNumber = (
  actual: number | undefined,
  expected: number,
  label: string
) => {
  if (!Number.isFinite(actual) || actual !== expected)
    throw new Error(`${label} is ${actual ?? 'missing'}, expected ${expected}`)
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

    const oldRow = await pg.oneOrNone<ContractRow>(
      `select id, data, token, resolution_time
       from contracts
       where id = $1`,
      [OLD_CONTRACT_ID]
    )
    if (!oldRow) throw new Error(`legacy BTC market ${OLD_CONTRACT_ID} missing`)
    const oldContract = asPerpContract(oldRow)
    if (
      oldContract.slug !== 'bitcoin-usd-perpetual' ||
      oldContract.oracleFeedId !== FEED_ID ||
      oldContract.creatorId !== DEV_MANIFOLD
    )
      throw new Error(
        `legacy BTC identity mismatch: ${oldContract.slug}/${oldContract.oracleFeedId}/${oldContract.creatorId}`
      )

    const unresolvedOthers = await pg.manyOrNone<ContractRow>(
      `select id, data, token, resolution_time
       from contracts
       where resolution_time is null
         and data->>'oracleFeedId' = $1
         and id <> $2`,
      [FEED_ID, OLD_CONTRACT_ID]
    )
    if (unresolvedOthers.length > 1)
      throw new Error(
        `${unresolvedOthers.length} non-legacy unresolved BTC markets already exist`
      )

    let replacementId: string
    if (unresolvedOthers.length === 1) {
      const candidate = asPerpContract(unresolvedOthers[0])
      if (
        candidate.question !== launchDefinition.question ||
        candidate.creatorId !== DEV_MANIFOLD
      )
        throw new Error(
          `unexpected unresolved BTC candidate ${candidate.id}: "${candidate.question}" by ${candidate.creatorId}`
        )
      replacementId = candidate.id
      log(`reusing existing replacement ${candidate.id} (${candidate.slug})`)
    } else {
      const created = await createPerp(
        {
          question: launchDefinition.question,
          description:
            'Tracks BTC/USD spot using the median price across Coinbase, Kraken, and Bitstamp.',
          visibility: 'unlisted',
          oracleFeedId: FEED_ID,
          maxLeverage: launchDefinition.recommended.maxLeverage,
          maxFundingRate,
          fundingSensitivity: launchDefinition.recommended.fundingSensitivity,
          maxOraclePriceAgeMs: launchDefinition.recommended.maxOraclePriceAgeMs,
          subsidyLong: launchDefinition.recommended.subsidyLong,
          subsidyShort: launchDefinition.recommended.subsidyShort,
        },
        scriptAuth,
        scriptRequest
      )
      if (!created || !('result' in created) || !('continue' in created))
        throw new Error('createPerp did not return its continuation')
      replacementId = created.result.id
      await created.continue()
      log(
        `created replacement ${created.result.id} (${created.result.slug}); discovery continuation complete`
      )
    }

    let replacementRow = await pg.one<ContractRow>(
      `select id, data, token, resolution_time
       from contracts
       where id = $1`,
      [replacementId]
    )
    let replacement = asPerpContract(replacementRow)
    if (replacementRow.resolution_time != null || replacement.isResolved)
      throw new Error(`replacement ${replacementId} is already resolved`)
    if (replacement.question !== launchDefinition.question)
      throw new Error(
        `replacement title is "${replacement.question}", expected "${launchDefinition.question}"`
      )
    if (replacement.visibility !== 'unlisted')
      throw new Error(
        `replacement visibility is ${replacement.visibility}, expected unlisted`
      )
    if (
      replacement.creatorId !== DEV_MANIFOLD ||
      replacement.oracleFeedId !== FEED_ID
    )
      throw new Error('replacement creator/feed identity mismatch')

    assertExactNumber(
      replacement.maxLeverage,
      launchDefinition.recommended.maxLeverage,
      'maxLeverage'
    )
    assertExactNumber(
      replacement.maxFundingRate,
      maxFundingRate,
      'maxFundingRate'
    )
    assertExactNumber(
      replacement.fundingSensitivity,
      launchDefinition.recommended.fundingSensitivity,
      'fundingSensitivity'
    )
    assertExactNumber(
      replacement.maxOraclePriceAgeMs,
      launchDefinition.recommended.maxOraclePriceAgeMs,
      'maxOraclePriceAgeMs'
    )
    assertExactNumber(
      replacement.fundingPeriodMs,
      fundingPeriodMs,
      'fundingPeriodMs'
    )
    assertExactNumber(
      replacement.initialPoolLong,
      launchDefinition.recommended.subsidyLong,
      'initialPoolLong'
    )
    assertExactNumber(
      replacement.initialPoolShort,
      launchDefinition.recommended.subsidyShort,
      'initialPoolShort'
    )

    let discovery = await pg.one<DiscoveryRow>(
      `select
         array(
           select g.slug
           from group_contracts gc
           join groups g on g.id = gc.group_id
           where gc.contract_id = $1
         ) as group_slugs,
         exists(
           select 1 from contract_embeddings where contract_id = $1
         ) as has_embedding`,
      [replacementId]
    )
    const requiredTopicSlugs = launchDefinition.requiredTopics.map((topic) =>
      getPerpLaunchTopicSlug(topic, 'DEV')
    )
    const requiredGroups = await pg.manyOrNone<{
      id: string
      slug: string
    }>(
      `select id, slug
       from groups
       where slug = any($1::text[])`,
      [requiredTopicSlugs]
    )
    if (requiredGroups.length !== requiredTopicSlugs.length)
      throw new Error(
        `expected ${requiredTopicSlugs.length} required BTC topic(s), found ${requiredGroups.length}`
      )

    // createPerp's discovery follow-ups are intentionally best-effort. Repair
    // either half of a topic write, and retry embeddings, so a transient
    // failure or interrupted first run remains safely rerunnable.
    for (const group of requiredGroups) {
      if (
        discovery.group_slugs.includes(group.slug) &&
        (replacement.groupSlugs ?? []).includes(group.slug)
      )
        continue

      await pg.tx(async (tx) => {
        await tx.none(
          `delete from group_contracts
           where contract_id = $1 and group_id = $2`,
          [replacementId, group.id]
        )
        await updateContract(tx, replacementId, {
          groupSlugs: FieldVal.arrayRemove(group.slug),
        })
        await addGroupToContract(tx, replacement, group)
      })
      log(`normalized replacement topic ${group.slug}`)
    }
    if (!discovery.has_embedding) {
      try {
        await generateContractEmbeddings(replacement, pg)
      } catch (error) {
        const concurrent = await pg.one<{ has_embedding: boolean }>(
          `select exists(
             select 1
             from contract_embeddings
             where contract_id = $1
           ) as has_embedding`,
          [replacementId]
        )
        if (!concurrent.has_embedding) throw error
      }
      log('generated replacement discovery embedding')
    }

    // Refresh denormalized topic state after any repair before final checks.
    replacementRow = await pg.one<ContractRow>(
      `select id, data, token, resolution_time
       from contracts
       where id = $1`,
      [replacementId]
    )
    replacement = asPerpContract(replacementRow)
    discovery = await pg.one<DiscoveryRow>(
      `select
         array(
           select g.slug
           from group_contracts gc
           join groups g on g.id = gc.group_id
           where gc.contract_id = $1
         ) as group_slugs,
         exists(
           select 1 from contract_embeddings where contract_id = $1
         ) as has_embedding`,
      [replacementId]
    )
    const missingTopic = requiredTopicSlugs.find(
      (slug) =>
        !discovery.group_slugs.includes(slug) ||
        !(replacement.groupSlugs ?? []).includes(slug)
    )
    if (missingTopic)
      throw new Error(
        `replacement discovery is missing topic ${missingTopic} in its join or cached slugs`
      )
    if (!discovery.has_embedding)
      throw new Error('replacement discovery embedding is missing')

    const ledger = await pg.one<{ balance: number | string }>(
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
      [replacementId]
    )
    if (
      !isPerpEscrowBalanced({
        ledgerBalance: Number(ledger.balance),
        poolLong: replacement.poolLong,
        poolShort: replacement.poolShort,
      })
    )
      throw new Error(
        `replacement escrow mismatch: ledger=${ledger.balance}, pools=${
          replacement.poolLong + replacement.poolShort
        }`
      )

    const replacementPositions = await pg.one<{ count: number | string }>(
      `select count(*) as count
       from contract_perp_positions
       where contract_id = $1`,
      [replacementId]
    )
    if (Number(replacementPositions.count) !== 0)
      throw new Error('replacement unexpectedly has an open position')

    const currentOld = await pg.one<{
      resolution_time: string | null
      position_count: number | string
    }>(
      `select
         c.resolution_time,
         (
           select count(*)
           from contract_perp_positions p
           where p.contract_id = c.id
         ) as position_count
       from contracts c
       where c.id = $1`,
      [OLD_CONTRACT_ID]
    )
    if (currentOld.resolution_time == null) {
      if (Number(currentOld.position_count) !== 0)
        throw new Error(
          `legacy BTC gained ${currentOld.position_count} position(s); refusing to resolve it`
        )
      const resolution = await resolvePerp(OLD_CONTRACT_ID, DEV_MANIFOLD, {
        requireNoOpenPositions: true,
      })
      log(
        `resolved legacy BTC at ${
          resolution.finalPrice
        }; returned ${resolution.residualPayout.toFixed(
          2
        )} residual mana to the official DEV creator`
      )
    } else {
      log('legacy BTC was already resolved')
    }

    const finalUnresolved = await pg.manyOrNone<{ id: string }>(
      `select id
       from contracts
       where resolution_time is null
         and data->>'oracleFeedId' = $1`,
      [FEED_ID]
    )
    if (finalUnresolved.length !== 1 || finalUnresolved[0].id !== replacementId)
      throw new Error(
        `expected only replacement ${replacementId} unresolved; found ${finalUnresolved
          .map((row) => row.id)
          .join(', ')}`
      )

    log(
      `READY: http://localhost:3000/${replacement.creatorUsername}/${replacement.slug}`
    )
  })
