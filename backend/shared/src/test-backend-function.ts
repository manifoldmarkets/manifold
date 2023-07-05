import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import * as admin from 'firebase-admin'
import { scoreContractsInternal } from 'shared/score-contracts-internal'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const fr = admin.firestore()
    const db = createSupabaseClient()
    await scoreContractsInternal(fr, db, pg, true)
  } catch (e) {
    console.error(e)
  }
}
