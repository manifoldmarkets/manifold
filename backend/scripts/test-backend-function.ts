import { closeMarketsInternal } from 'functions/scheduled/close-markets-randomly'
import { runScript } from './run-script'

async function testScheduledFunction() {
  await runScript(async ({ firestore }) => {
    // await getReferralCount('AJwLWoo3xue32XIiAVrL5SyR1WB2', 0, db)
    try {
      console.log('test closing market')
      await closeMarketsInternal(firestore)
      // await resetDailyQuestStatsInternal()
      // const user = await getUser('AJwLWoo3xue32XIiAVrL5SyR1WB2')
      // // if (!user) throw new Error('Could not find user')
      // // await completeReferralsQuest(user)
      // const contract = await getContract('bI8QMSDxXB7osvt7SVsD')
      // if (!user || !contract) throw new Error('Could not find user or contract')
      // const now = Date.now()
      // const contractId = contract.id
      // const priorUserBets = await getPriorContractBets(contractId, user.id, now)
      // await completeArchaeologyQuest(
      //   priorUserBets[0],
      //   user,
      //   contract,
      //   'asdasniuewnr'
      // )
    } catch (e) {
      console.error(e)
    }
  })
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
