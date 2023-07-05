import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUserToReasonsInterestedInContractAndUser } from 'shared/supabase/contracts'
import { INTEREST_DISTANCE_THRESHOLDS } from 'common/feed'
import { bulkInsertDataToUserFeed } from 'shared/create-feed'
import * as crypto from 'crypto'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    // await populateNewUsersFeed('GJrkVojV9bPrC81NfCwYbSXWsc23', pg, true)
    // await spiceUpNewUsersFeedBasedOnTheirInterests(
    //   'yG1B9kzWqUQ1RhzlD8r2C51r2772',
    //   pg
    // )
    // const res = await isContractLikelyNonPredictive('7WI6lR0BbROVdvpful5e', pg)
    // const contract = await getContract('7WI6lR0BbROVdvpful5e')
    // if (!contract) throw new Error('Could not find contract')
    // await addGroupToContract(contract, {
    //   id: NON_PREDICTIVE_GROUP_ID,
    //   slug: 'nonpredictive',
    //   name: 'Non-Predictive',
    // })
    const interestedUsers = await getUserToReasonsInterestedInContractAndUser(
      'eZjwPatJPKK8Z1onH1bx',
      'YGZdZUSFQyM8j2YzPaBqki8NBz23',
      pg,
      [
        'follow_user',
        'similar_interest_vector_to_user',
        'similar_interest_vector_to_contract',
      ],
      INTEREST_DISTANCE_THRESHOLDS.popular_comment
    )
    // const dict: {
    //   [userId: string]: CONTRACT_OR_USER_FEED_REASON_TYPES
    // } = {
    //   ['AJwLWoo3xue32XIiAVrL5SyR1WB2']: 'follow_user',
    // }
    const date = new Date('Jul 3, 2023, 2:21:05 PM').valueOf()
    await bulkInsertDataToUserFeed(
      interestedUsers,
      date,
      'new_contract',
      ['YGZdZUSFQyM8j2YzPaBqki8NBz23'],
      {
        contractId: 'eZjwPatJPKK8Z1onH1bx',
        creatorId: 'YGZdZUSFQyM8j2YzPaBqki8NBz23',
        idempotencyKey: crypto.randomUUID(),
      },
      pg
    )

    // console.log(res)
    // await addContractsWithLargeProbChangesToFeed()
    //
    // const contract = await getContract('qGUa5xkW2XDoZdZebpfi')
    // if (!contract) throw new Error('Could not find contract')
    // await addContractToFeed(
    //   contract,
    //   [
    //     'follow_user',
    //     // 'similar_interest_vector_to_user',
    //     // 'similar_interest_vector_to_contract',
    //   ],
    //   'new_contract',
    //   [],
    //   {
    //     minUserInterestDistanceToContract: 0.5,
    //   }
    // )
  } catch (e) {
    console.error(e)
  }
}
