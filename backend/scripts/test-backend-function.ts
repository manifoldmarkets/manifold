import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import * as admin from 'firebase-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createLeagueChangedNotification } from 'shared/create-notification'
const firestore = admin.firestore()

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    await createLeagueChangedNotification(
      'lSzNB9votdcpfputrw1xWvVzp083',
      { season: 2, division: 3, cohort: 'Oracular-dingdong' },
      { season: 1, division: 4, cohort: 'Oracular-Pythias' },
      10,
      pg
    )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
