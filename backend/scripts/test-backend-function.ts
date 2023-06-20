import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { populateNewUsersFeedFromEmbeddings } from 'shared/supabase/users'
const firestore = admin.firestore()

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const defaultEmbedding = await populateNewUsersFeedFromEmbeddings(
      'MIayehKYWqZNdgXIk0jxEmIVXeG3',
      pg
    )
    console.log('defaultEmbedding', defaultEmbedding)

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
