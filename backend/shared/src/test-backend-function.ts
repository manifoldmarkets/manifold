import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'

import { addInterestingContractsToFeed } from 'shared/add-interesting-contracts-to-feed'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    await addInterestingContractsToFeed(db, pg, true)

    // await getUsersWithSimilarInterestVectorsToContract(
    //   'YTIuuSsNRn2OlA4KykRM',
    //   pg,
    //   0.15
    // )
  } catch (e) {
    console.error(e)
  }
}
