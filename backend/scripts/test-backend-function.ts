import { getServiceAccountCredentials, initAdmin } from 'shared/init-admin'
initAdmin()
import { loadSecretsToEnv } from 'shared/secrets'
import { getContract, getUser } from 'shared/utils'
import {
  getMostRecentCommentableBet,
  getPriorContractBets,
  getPriorUserComments,
} from 'functions/triggers/on-create-comment-on-contract'

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)
  try {
    // await resetDailyQuestStatsInternal()
    const user = await getUser('AJwLWoo3xue32XIiAVrL5SyR1WB2')
    // if (!user) throw new Error('Could not find user')
    // await completeReferralsQuest(user)
    const contract = await getContract('MCaB4moXujkUGsWCSy76')
    if (!user || !contract) throw new Error('Could not find user or contract')
    const now = Date.now()
    const contractId = contract.id
    const priorUserBets = await getPriorContractBets(contractId, user.id, now)
    const priorUserComments = await getPriorUserComments(
      contractId,
      user.id,
      now
    )
    const bet = getMostRecentCommentableBet(
      now,
      priorUserBets,
      priorUserComments
    )
    console.log(bet)
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
