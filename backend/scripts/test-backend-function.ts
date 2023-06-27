import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isContractLikelyNonPredictive } from 'shared/supabase/contracts'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { NON_PREDICTIVE_GROUP_ID } from 'common/supabase/groups'
import { getContract } from 'shared/utils'
const firestore = admin.firestore()

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    // await repopulateNewUsersFeedFromEmbeddings(
    //   'GJrkVojV9bPrC81NfCwYbSXWsc23',
    //   pg,
    //   true
    // )
    // await spiceUpNewUsersFeedBasedOnTheirInterests(
    //   'yG1B9kzWqUQ1RhzlD8r2C51r2772',
    //   pg
    // )
    const res = await isContractLikelyNonPredictive('Ioio40vZNkQ9thAzWpIQ', pg)
    const contract = await getContract('Ioio40vZNkQ9thAzWpIQ')
    if (!contract) throw new Error('Could not find contract')
    await addGroupToContract(contract, {
      id: NON_PREDICTIVE_GROUP_ID,
      slug: 'nonpredictive',
      name: 'Non-Predictive',
    })
    console.log(res)
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

if (require.main === module) testScheduledFunction().then(() => process.exit())
