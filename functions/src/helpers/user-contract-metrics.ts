import { Contract } from '../../../common/contract'
import { Bet } from '../../../common/bet'
import { groupBy } from 'lodash'
import { getUser } from '../utils'
import { calculateMetricsByContract } from '../../../common/calculate-metrics'
import * as admin from 'firebase-admin'
const firestore = admin.firestore()

export async function updateContractMetricsForUsers(contract: Contract) {
  // get all the users who bet on the contract
  const betSnap = await firestore
    .collection(`contracts/${contract.id}/bets`)
    .get()
  const allContractBets = betSnap.docs.map((doc) => doc.data() as Bet)
  // group bets by userId
  const betsByUser = groupBy(allContractBets, 'userId')
  await Promise.all(
    Object.entries(betsByUser).map(async ([userId, bets]) => {
      const user = await getUser(userId)
      if (!user) return
      const newMetrics = calculateMetricsByContract(
        { [contract.id]: bets },
        { [contract.id]: contract },
        user
      )
      await firestore
        .collection(`users/${user.id}/contract-metrics`)
        .doc(contract.id)
        .set(newMetrics[0])
    })
  )
}
