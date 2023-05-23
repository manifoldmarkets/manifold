import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import * as admin from 'firebase-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'
const firestore = admin.firestore()

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  // await getReferralCount('AJwLWoo3xue32XIiAVrL5SyR1WB2', 0, db)
  try {
    const pg = createSupabaseDirectClient()
    const followerIds = await pg.manyOrNone(
      `select follow_id from contract_follows where contract_id = $1`,
      ['YxRPgMjXuT4ywJyOi6Qr']
    )
    console.log(followerIds)
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
