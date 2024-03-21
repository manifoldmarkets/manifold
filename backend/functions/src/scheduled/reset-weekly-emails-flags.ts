import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'common/secrets'

export const resetWeeklyEmailsFlags = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '8GB',
    secrets,
  })
  .pubsub // every Saturday at 12 am PT (3 days before the emails will be sent)
  .schedule('0 0 * * 6')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    const pg = createSupabaseDirectClient()
    const userIds = await pg.map<string>(
      'select id from users',
      [],
      (r) => r.id
    )
    const firestore = admin.firestore()
    const writer = firestore.bulkWriter()
    for (const userId of userIds) {
      writer.update(firestore.collection('private-users').doc(userId), {
        weeklyTrendingEmailSent: false,
        weeklyPortfolioUpdateEmailSent: false,
      }).catch((e) => console.error(e))
    }
    await writer.close()
  })
