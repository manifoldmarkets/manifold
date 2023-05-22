import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { streakExpirationNotificationsInternal } from 'functions/scheduled/streak-expiration-notification'

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  // await getReferralCount('AJwLWoo3xue32XIiAVrL5SyR1WB2', 0, db)
  try {
    await streakExpirationNotificationsInternal()
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
