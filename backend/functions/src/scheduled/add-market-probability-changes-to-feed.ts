import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUserToReasonsInterestedInContractAndUser } from 'shared/supabase/contracts'
import { insertDataToUserFeed } from 'shared/create-feed'

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

  return await Promise.all(
    contracts.map(async (contract) => {
      const usersToReasons = await getUserToReasonsInterestedInContractAndUser(
        contract.id,
        contract.creator_id,
        pg,
        [
          'follow_contract',
          'liked_contract',
          'viewed_contract',
          'follow_creator',
        ]
      )
      console.log(
        'found users interested in contract',
        contract.id,
        Object.keys(usersToReasons).length
      )
      return await Promise.all(
        Object.keys(usersToReasons).map(async (userId) => {
          await insertDataToUserFeed(
            userId,
            Date.now(),
            'contract_probability_changed',
            {
              reason: usersToReasons[userId],
              contractId: contract.id,
              creatorId: contract.creator_id,
            },
            pg
          )
        })
      )
    })
  )
}
