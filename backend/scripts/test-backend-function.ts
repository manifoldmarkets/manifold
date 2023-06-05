import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import * as admin from 'firebase-admin'

import { getUsersWithSimilarInterestVectorToUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
const firestore = admin.firestore()

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    // await addContractsWithLargeProbChangesToFeed()
    const userIds = await getUsersWithSimilarInterestVectorToUser(
      'AJwLWoo3xue32XIiAVrL5SyR1WB2',
      pg
    )
    console.log('userids', userIds.length)
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
