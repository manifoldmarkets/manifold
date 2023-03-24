import { getServiceAccountCredentials, initAdmin } from 'shared/init-admin'
initAdmin()
import { completeArchaeologyQuest } from 'shared/quest'
import { getContract, getUser } from 'shared/utils'
import { loadSecretsToEnv } from 'shared/secrets'
import { Bet } from 'common/bet'

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)
  try {
    const user = await getUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')
    const contract = await getContract('TXqpswOSxT7WtbSq7bKG')
    if (!user || !contract) throw new Error('Could not find user or contract')
    await completeArchaeologyQuest(
      { isRedemption: false } as Bet,
      user,
      contract,
      'ascafwn45'
    )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
