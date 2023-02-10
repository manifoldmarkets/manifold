import { initAdmin } from 'shared/init-admin'
initAdmin()
import { sendPortfolioUpdateEmailsToAllUsers } from 'functions/weekly-portfolio-emails'
import { getAllPrivateUsers } from 'shared/utils'
import * as admin from 'firebase-admin'

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
