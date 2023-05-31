import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insertContractRelatedDataToUsersFeeds } from 'shared/create-feed'

export const addMarketProbabilityChangesToFeedScheduled = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 12 hours')
  .onRun(async () => {
    addContractsWithLargeProbChangesToFeed()
  })

export const addContractsWithLargeProbChangesToFeed = async () => {
  const pg = createSupabaseDirectClient()
  const contracts = await pg.manyOrNone<{ id: string; creator_id: string }>(
    `SELECT id, creator_id
  FROM contracts
  WHERE mechanism = 'cpmm-1'
    AND jsonb_typeof((data->'dailyScore')) != 'null'
    and visibility != 'private'
    AND ((data->'dailyScore')::numeric) > 2`
  )
  console.log('found updated contracts to add to feed', contracts.length)
  return await insertContractRelatedDataToUsersFeeds(
    contracts.map((c) => ({ id: c.id, creatorId: c.creator_id })),
    'contract_probability_changed',
    ['follow_contract', 'liked_contract', 'viewed_contract', 'follow_creator'],
    Date.now(),
    pg
  )
}
