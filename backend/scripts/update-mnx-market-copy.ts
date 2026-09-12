// Preview the partner's metadata templates, then apply with an explicit editor.
// Run with the normal script credentials and matching Firebase project:
//   NEXT_PUBLIC_FIREBASE_ENV=PROD yarn ts-node update-mnx-market-copy.ts
//   NEXT_PUBLIC_FIREBASE_ENV=PROD yarn ts-node update-mnx-market-copy.ts --apply --editor-id=USER_ID

import { isEqual } from 'lodash'
import { Contract } from 'common/contract'
import { ENV } from 'common/envs/constants'
import { getMnxCreatorId, isMnxOwnedPerp } from 'common/perps/creator-accounts'
import { MNX_INSTRUMENTS, getMnxInstrument } from 'common/perps/mnx'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { getLocalEnv } from 'shared/init-admin'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { revalidateContractStaticProps } from 'shared/utils'

const getCopy = (contract: Contract) => ({
  question: contract.question,
  description: contract.description,
  ticker: contract.mechanism === 'perp' ? contract.ticker : undefined,
})

const readMarkets = async (pg: SupabaseDirectClient, lock = false) =>
  pg.map<Contract>(
    `select data from contracts
     where creator_id = $1 and mechanism = 'perp'
       and resolution_time is null
       and data->>'oracleFeedId' = any($2::text[])
     order by id ${lock ? 'for update' : ''}`,
    [getMnxCreatorId(ENV), MNX_INSTRUMENTS.map((i) => i.feedId)],
    (row) => row.data
  )

const run = async (apply: boolean, editorId: string | undefined) => {
  if (!['DEV', 'PROD'].includes(process.env.NEXT_PUBLIC_FIREBASE_ENV ?? ''))
    throw new Error('Set NEXT_PUBLIC_FIREBASE_ENV explicitly to DEV or PROD')
  if (ENV !== getLocalEnv())
    throw new Error('Select the matching Firebase project')
  if (!getMnxCreatorId(ENV))
    throw new Error(`MNX has no configured creator in ${ENV}`)
  if (apply && !editorId)
    throw new Error('--apply requires --editor-id=USER_ID')

  const { runScript } = await import('./run-script')
  await runScript(async ({ pg }) => {
    if (editorId) {
      const editor = await pg.oneOrNone<{ id: string }>(
        'select id from users where id = $1',
        [editorId]
      )
      if (!editor) throw new Error('The edit-history user does not exist')
    }

    const contracts = await readMarkets(pg)
    if (!contracts.length) throw new Error('No live MNX-owned markets found')
    const feeds = new Set<string>()
    const plans = contracts.map((contract) => {
      if (
        contract.mechanism !== 'perp' ||
        contract.outcomeType !== 'PERP' ||
        contract.isResolved ||
        !isMnxOwnedPerp(contract, ENV)
      )
        throw new Error(`Unexpected market identity: ${contract.id}`)
      const spec = getMnxInstrument(contract.oracleFeedId)!
      if (feeds.has(spec.feedId))
        throw new Error(`Multiple live MNX-owned markets for ${spec.feedId}`)
      feeds.add(spec.feedId)
      const ticker = getPerpFeedTicker(spec.feedId)
      if (!ticker) throw new Error(`No canonical ticker for ${spec.feedId}`)
      const before = getCopy(contract)
      const after = {
        question: spec.question,
        description: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: spec.description }],
            },
          ],
        },
        ticker,
      }
      const updatedKeys = (Object.keys(after) as (keyof typeof after)[]).filter(
        (key) => !isEqual(before[key], after[key])
      )
      return { contract, before, after, updatedKeys }
    })
    const changed = plans.filter((plan) => plan.updatedKeys.length)
    console.log(
      `${ENV}: ${apply ? 'APPLY' : 'DRY RUN'}, ${changed.length} edits`
    )
    for (const { contract, before, after } of changed)
      console.log(
        JSON.stringify({ id: contract.id, slug: contract.slug, before, after })
      )
    console.log(
      `Found ${contracts.length} of ${MNX_INSTRUMENTS.length} registered instruments.`
    )
    if (!apply) return

    await pg.tx(async (tx) => {
      await tx.none("set local lock_timeout = '5s'")
      const locked = await readMarkets(tx, true)
      if (
        !isEqual(
          locked.map((contract) => contract.id),
          contracts.map((contract) => contract.id)
        )
      )
        throw new Error('The MNX market cohort changed; rerun the preview')
      for (const { contract, before, after, updatedKeys } of changed) {
        const current = locked.find((c) => c.id === contract.id)!
        if (
          !isMnxOwnedPerp(current, ENV) ||
          current.isResolved ||
          current.outcomeType !== 'PERP' ||
          current.mechanism !== 'perp' ||
          contract.mechanism !== 'perp' ||
          current.oracleFeedId !== contract.oracleFeedId ||
          !isEqual(getCopy(current), before)
        )
          throw new Error(`Market ${contract.id} changed; rerun the preview`)
        await tx.none(
          `insert into contract_edits (contract_id, editor_id, data, updated_keys)
           values ($1, $2, $3, $4)`,
          [contract.id, editorId, current, updatedKeys]
        )
        // Merge only the requested metadata; never write back a stale price,
        // pool, position, visibility, slug, or other trading state.
        await tx.none(
          'update contracts set data = data || $2::jsonb where id = $1',
          [contract.id, { ...after, lastUpdatedTime: Date.now() }]
        )
      }
    })

    const verified = await readMarkets(pg)
    for (const { contract, after } of plans) {
      const current = verified.find((c) => c.id === contract.id)
      if (!current || !isEqual(getCopy(current), after))
        throw new Error(`Verification failed for ${contract.id}`)
      // Refresh even on a no-op retry, in case an earlier run committed but
      // failed before refreshing the pages.
      await revalidateContractStaticProps(current)
    }
    console.log(
      `Applied ${changed.length} edits and verified ${plans.length} markets.`
    )
  })
}

if (require.main === module) {
  const args = process.argv.slice(2)
  if (
    args.some((arg) => arg !== '--apply' && !arg.startsWith('--editor-id=')) ||
    args.filter((arg) => arg === '--apply').length > 1 ||
    args.filter((arg) => arg.startsWith('--editor-id=')).length > 1
  )
    throw new Error('Expected [--apply --editor-id=USER_ID]')
  run(
    args.includes('--apply'),
    args
      .find((arg) => arg.startsWith('--editor-id='))
      ?.slice('--editor-id='.length)
  ).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Metadata update failed'
    )
    process.exit(1)
  })
}
