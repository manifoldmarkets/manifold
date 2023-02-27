import { initAdmin } from 'shared/init-admin'
initAdmin()
import { getDescriptionForQuestion } from 'shared/helpers/openai-utils'

async function testScheduledFunction() {
  // await saveWeeklyContractMetricsInternal()
  await getDescriptionForQuestion(
    'Will an interstellar mission to alpha centauri be launched before 2040?'
  )

  // await sendPortfolioUpdateEmailsToAllUsers()
  // const privateUsers = await getAllPrivateUsers()
  // const firestore = admin.firestore()
  // await Promise.all(
  //   privateUsers.map(async (user) => {
  //     return firestore.collection('private-users').doc(user.id).update({
  //       weeklyTrendingEmailSent: false,
  //       weeklyPortfolioUpdateEmailSent: false,
  //     })
  //   })
  // )
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
