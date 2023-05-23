import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { updateUniqueBettorsAndGiveCreatorBonus } from 'functions/triggers/on-create-bet'
import { getContract, getUser } from 'shared/utils'
import * as admin from 'firebase-admin'
import { Bet } from 'common/bet'
const firestore = admin.firestore()

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  // await getReferralCount('AJwLWoo3xue32XIiAVrL5SyR1WB2', 0, db)
  try {
    const contract = await getContract('dZEzUCVJm9RdtWyfByO7')
    const bet = await firestore
      .collection('contracts')
      .doc('dZEzUCVJm9RdtWyfByO7')
      .collection('bets')
      .doc('eq6OCiOlTl4r4r7Txdwa')
      .get()
      .then((doc) => doc.data() as Bet)
    const user = await getUser('lSzNB9votdcpfputrw1xWvVzp083')
    if (!bet || !contract || !user) throw new Error('missing data')
    await updateUniqueBettorsAndGiveCreatorBonus(
      contract,
      'asdasdasd',
      user,
      bet
    )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
