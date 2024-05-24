/* eslint-disable */
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import * as admin from 'firebase-admin'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { updateCreatorMetricsCore } from 'shared/update-creator-metrics-core'
import { calculateImportanceScore } from 'shared/importance-score'
import { backfillUserTopicInterests } from 'shared/backfill-user-topic-interests'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    const firestore = admin.firestore()
    // await backfillUserTopicInterests(pg)
    // await calculateImportanceScore(db, pg)
    // await updateContractMetricsCore()
    await updateUserMetricsCore(['AJwLWoo3xue32XIiAVrL5SyR1WB2'], true)
    // await updateCreatorMetricsCore()
  } catch (e) {
    console.error(e)
  }
}
