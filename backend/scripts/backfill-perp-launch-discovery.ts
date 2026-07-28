// Backfill the two database prerequisites used to discover the four launch
// PERPs: required group_contracts rows and contract_embeddings rows.
//
// Dry-run (default):
//   yarn ts-node backfill-perp-launch-discovery.ts
//
// Apply:
//   yarn ts-node backfill-perp-launch-discovery.ts --apply

import { keyBy, sumBy, uniq } from 'lodash'

import { Contract } from 'common/contract'
import { getLocalEnv } from 'shared/init-admin'
import {
  PERP_LAUNCH_EXCLUDED_FEED_IDS,
  PERP_LAUNCH_MARKETS,
  PerpLaunchMarketDefinition,
  getPerpLaunchManifestErrors,
  getPerpLaunchTopicSlug,
} from 'shared/perps/launch-manifest'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  generateContractEmbeddings,
  getContractsDirect,
  updateContract,
} from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { runScript } from 'run-script'

type LaunchContractRow = {
  id: string
  feed_id: string
}

type GroupRow = {
  id: string
  slug: string
  name: string
}

type DiscoveryState = {
  groupIds: string[]
  contractGroupSlugs: string[]
  hasEmbedding: boolean
}

type RequiredGroup = GroupRow & {
  expectedName: string
}

type DiscoveryPlan = {
  contract: Contract
  definition: PerpLaunchMarketDefinition
  requiredGroups: RequiredGroup[]
  missingGroups: RequiredGroup[]
  missingGroupLinks: RequiredGroup[]
  missingContractGroupSlugs: RequiredGroup[]
  hasEmbedding: boolean
}

type LaunchEnvironment = ReturnType<typeof getLocalEnv>

const usage = 'Usage: yarn ts-node backfill-perp-launch-discovery.ts [--apply]'

const readDiscoveryState = async (
  pg: SupabaseDirectClient,
  contractId: string
): Promise<DiscoveryState> => {
  const row = await pg.one<{
    group_ids: string[]
    contract_group_slugs: string[]
    has_embedding: boolean
  }>(
    `select
       array(
         select group_id
         from group_contracts
         where contract_id = $1
       ) as group_ids,
       coalesce(
         (
           select data->'groupSlugs'
           from contracts
           where id = $1
         ),
         '[]'::jsonb
       ) as contract_group_slugs,
       exists(
         select 1
         from contract_embeddings
         where contract_id = $1
       ) as has_embedding`,
    [contractId]
  )
  return {
    groupIds: row.group_ids,
    contractGroupSlugs: Array.isArray(row.contract_group_slugs)
      ? row.contract_group_slugs
      : [],
    hasEmbedding: row.has_embedding,
  }
}

const makePlans = async (
  pg: SupabaseDirectClient,
  rows: LaunchContractRow[],
  groupsBySlug: Record<string, GroupRow>,
  environment: LaunchEnvironment
): Promise<DiscoveryPlan[]> => {
  const contracts = await getContractsDirect(
    rows.map((row) => row.id),
    pg
  )
  const contractsById = keyBy(contracts, 'id')
  const definitionsByFeedId = keyBy(PERP_LAUNCH_MARKETS, 'feedId')

  return await Promise.all(
    rows.map(async (row) => {
      const contract = contractsById[row.id]
      if (!contract)
        throw new Error(`Could not load launch PERP contract ${row.id}`)
      if (
        contract.mechanism !== 'perp' ||
        contract.outcomeType !== 'PERP' ||
        contract.oracleFeedId !== row.feed_id ||
        contract.isResolved
      )
        throw new Error(
          `Contract ${row.id} no longer matches the unresolved launch PERP query`
        )

      const definition = definitionsByFeedId[row.feed_id]
      if (!definition)
        throw new Error(`No launch definition for feed ${row.feed_id}`)

      const requiredGroups = definition.requiredTopics.map((topic) => {
        const requiredSlug = getPerpLaunchTopicSlug(topic, environment)
        const group = groupsBySlug[requiredSlug]
        if (!group)
          throw new Error(
            `Required topic ${topic.name} (${requiredSlug}) does not exist`
          )
        return { ...group, expectedName: topic.name }
      })
      const state = await readDiscoveryState(pg, contract.id)
      const attachedGroupIds = new Set(state.groupIds)
      const cachedGroupSlugs = new Set(state.contractGroupSlugs)
      const missingGroupLinks = requiredGroups.filter(
        (group) => !attachedGroupIds.has(group.id)
      )
      const missingContractGroupSlugs = requiredGroups.filter(
        (group) => !cachedGroupSlugs.has(group.slug)
      )

      return {
        contract,
        definition,
        requiredGroups,
        missingGroups: requiredGroups.filter(
          (group) =>
            !attachedGroupIds.has(group.id) || !cachedGroupSlugs.has(group.slug)
        ),
        missingGroupLinks,
        missingContractGroupSlugs,
        hasEmbedding: state.hasEmbedding,
      }
    })
  )
}

const printPlans = (
  plans: DiscoveryPlan[],
  missingMarketFeedIds: string[],
  apply: boolean
) => {
  console.log(apply ? 'Mode: APPLY' : 'Mode: DRY RUN (no writes)')

  for (const definition of PERP_LAUNCH_MARKETS) {
    const plan = plans.find(
      (candidate) => candidate.definition.feedId === definition.feedId
    )
    if (!plan) {
      console.log(
        `[MISSING MARKET] ${definition.feedId} | ${definition.question}`
      )
      continue
    }

    console.log(
      `[${plan.contract.slug}] ${definition.feedId} | ${plan.contract.id}`
    )
    console.log(
      `  topics: ${
        plan.missingGroups.length === 0
          ? `ready (${plan.requiredGroups
              .map((group) => `${group.expectedName}: ${group.slug}`)
              .join(', ')})`
          : `repair ${plan.missingGroups
              .map((group) => {
                const missing = [
                  ...(plan.missingGroupLinks.some(
                    (candidate) => candidate.id === group.id
                  )
                    ? ['group_contracts']
                    : []),
                  ...(plan.missingContractGroupSlugs.some(
                    (candidate) => candidate.id === group.id
                  )
                    ? ['contract groupSlugs']
                    : []),
                ]
                return `${group.expectedName} (${group.slug}: ${missing.join(
                  ' + '
                )})`
              })
              .join(', ')}`
      }`
    )
    console.log(
      `  embedding: ${plan.hasEmbedding ? 'ready' : 'generate and insert'}`
    )
  }

  const inconsistentTopics = sumBy(plans, (plan) => plan.missingGroups.length)
  const missingEmbeddings = plans.filter((plan) => !plan.hasEmbedding).length
  console.log(
    `Summary: ${plans.length} market(s) found, ${missingMarketFeedIds.length} missing, ` +
      `${inconsistentTopics} topic state(s) and ${missingEmbeddings} embedding(s) to repair.`
  )
}

const run = async (apply: boolean) => {
  await runScript(async ({ pg }) => {
    const environment = getLocalEnv()
    console.log(`Target environment: ${environment}`)

    const manifestErrors = getPerpLaunchManifestErrors()
    if (manifestErrors.length > 0)
      throw new Error(
        `Launch manifest is invalid:\n- ${manifestErrors.join('\n- ')}`
      )

    const launchFeedIds = PERP_LAUNCH_MARKETS.map((market) => market.feedId)
    const accidentallyIncludedFeedIds = PERP_LAUNCH_EXCLUDED_FEED_IDS.filter(
      (feedId) => launchFeedIds.includes(feedId)
    )
    if (accidentallyIncludedFeedIds.length > 0)
      throw new Error(
        `Refusing to target excluded feed(s): ${accidentallyIncludedFeedIds.join(
          ', '
        )}`
      )

    const rows = await pg.manyOrNone<LaunchContractRow>(
      `select id, data->>'oracleFeedId' as feed_id
       from contracts
       where mechanism = 'perp'
         and resolution_time is null
         and data->>'oracleFeedId' = any($1::text[])
       order by data->>'oracleFeedId', created_time`,
      [launchFeedIds]
    )

    const duplicateFeedIds = launchFeedIds.filter(
      (feedId) => rows.filter((row) => row.feed_id === feedId).length > 1
    )
    if (duplicateFeedIds.length > 0)
      throw new Error(
        `Refusing ambiguous launch feed(s) with multiple unresolved PERPs: ${duplicateFeedIds.join(
          ', '
        )}`
      )

    const requiredTopicSlugs = uniq(
      PERP_LAUNCH_MARKETS.flatMap((market) =>
        market.requiredTopics.map((topic) =>
          getPerpLaunchTopicSlug(topic, environment)
        )
      )
    )
    const groups = await pg.manyOrNone<GroupRow>(
      `select id, slug, name
       from groups
       where slug = any($1::text[])`,
      [requiredTopicSlugs]
    )
    const groupsBySlug = keyBy(groups, 'slug')
    const missingGroupSlugs = requiredTopicSlugs.filter(
      (slug) => !groupsBySlug[slug]
    )
    if (missingGroupSlugs.length > 0)
      throw new Error(
        `Required launch topic slug(s) do not exist in this environment: ${missingGroupSlugs.join(
          ', '
        )}`
      )
    const invalidGroups = groups.filter((group) => !group.id)
    if (invalidGroups.length > 0)
      throw new Error(
        `Required launch topic(s) have no id: ${invalidGroups
          .map((group) => group.slug)
          .join(', ')}`
      )

    for (const definition of PERP_LAUNCH_MARKETS) {
      for (const topic of definition.requiredTopics) {
        const requiredSlug = getPerpLaunchTopicSlug(topic, environment)
        const group = groupsBySlug[requiredSlug]
        if (group.name !== topic.name)
          console.warn(
            `Topic ${requiredSlug} is named "${group.name}" in the database; ` +
              `the manifest label is "${topic.name}". The environment-specific slug remains authoritative.`
          )
      }
    }

    const plans = await makePlans(pg, rows, groupsBySlug, environment)
    const foundFeedIds = rows.map((row) => row.feed_id)
    const missingMarketFeedIds = launchFeedIds.filter(
      (feedId) => !foundFeedIds.includes(feedId)
    )
    printPlans(plans, missingMarketFeedIds, apply)

    const changesNeeded =
      sumBy(plans, (plan) => plan.missingGroups.length) +
      plans.filter((plan) => !plan.hasEmbedding).length
    if (changesNeeded === 0) {
      console.log(
        'All existing launch PERPs already have discovery prerequisites.'
      )
      return
    }
    if (!apply) {
      console.log(
        'Dry run complete. Re-run with --apply to write the listed changes.'
      )
      return
    }

    for (const plan of plans) {
      for (const group of plan.missingGroups) {
        console.log(
          `Normalizing topic ${group.expectedName} (${group.id}) on ${plan.contract.slug}`
        )
        await pg.tx(async (tx) => {
          // Normalize both representations inside one transaction. This also
          // repairs the historical half-write where group_contracts exists
          // but contract.data.groupSlugs does not (or vice versa).
          await tx.none(
            `delete from group_contracts
             where contract_id = $1 and group_id = $2`,
            [plan.contract.id, group.id]
          )
          await updateContract(tx, plan.contract.id, {
            groupSlugs: FieldVal.arrayRemove(group.slug),
          })
          await addGroupToContract(tx, plan.contract, group)
        })
      }

      if (!plan.hasEmbedding) {
        console.log(`Generating embedding for ${plan.contract.slug}`)
        try {
          await generateContractEmbeddings(plan.contract, pg)
        } catch (error) {
          // generateContractEmbeddings uses INSERT ... ON CONFLICT DO NOTHING
          // with pg.one(). A concurrent insert therefore throws despite leaving
          // the prerequisite satisfied; distinguish that harmless race from a
          // real generation or database failure.
          const state = await readDiscoveryState(pg, plan.contract.id)
          if (!state.hasEmbedding) throw error
          console.warn(
            `Embedding for ${plan.contract.slug} appeared concurrently; continuing.`
          )
        }
      }
    }

    const verificationPlans = await makePlans(
      pg,
      rows,
      groupsBySlug,
      environment
    )
    const incomplete = verificationPlans.filter(
      (plan) => plan.missingGroups.length > 0 || !plan.hasEmbedding
    )
    if (incomplete.length > 0)
      throw new Error(
        `Backfill verification failed for: ${incomplete
          .map((plan) => plan.contract.slug)
          .join(', ')}`
      )

    console.log(
      `Backfill complete and verified for ${verificationPlans.length} launch PERP(s).`
    )
  })
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const unknownArgs = args.filter(
    (arg) => arg !== '--apply' && arg !== '--help'
  )
  const hasDuplicateApply = args.filter((arg) => arg === '--apply').length > 1
  if (unknownArgs.length > 0 || hasDuplicateApply) {
    console.error(usage)
    process.exitCode = 1
  } else if (args.includes('--help')) {
    console.log(usage)
  } else {
    void run(args.includes('--apply'))
  }
}
