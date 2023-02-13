import { initAdmin } from 'shared/init-admin'
initAdmin()
import { getAllPrivateUsers } from 'shared/utils'
import * as admin from 'firebase-admin'
import { sendPortfolioUpdateEmailsToAllUsers } from 'functions/scheduled/weekly-portfolio-emails'

async function testScheduledFunction() {
  await sendPortfolioUpdateEmailsToAllUsers()
  const privateUsers = await getAllPrivateUsers()
  const firestore = admin.firestore()
  await Promise.all(
    privateUsers.map(async (user) => {
      return firestore.collection('private-users').doc(user.id).update({
        weeklyTrendingEmailSent: false,
        weeklyPortfolioUpdateEmailSent: false,
      })
    })
  )
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
