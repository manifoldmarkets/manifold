import { getServiceAccountCredentials, initAdmin } from 'shared/init-admin'
initAdmin()
import { loadSecretsToEnv } from 'shared/secrets'
import { completeReferralsQuest } from 'shared/complete-quest-internal'
import { getUser } from 'shared/utils'

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)
  try {
    // await resetDailyQuestStatsInternal()
    const user = await getUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')
    if (!user) throw new Error('Could not find user')
    await completeReferralsQuest(user)
    // const contract = await getContract('TXqpswOSxT7WtbSq7bKG')
    // if (!user || !contract) throw new Error('Could not find user or contract')
    // await completeArchaeologyQuest(
    //   { isRedemption: false } as Bet,
    //   user,
    //   contract,
    //   'ascafwn45'
    // )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
