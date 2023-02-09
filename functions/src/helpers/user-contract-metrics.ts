import * as admin from 'firebase-admin'
import { groupBy } from 'lodash'

import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { calculateUserMetrics } from 'common/calculate-metrics'

const firestore = admin.firestore()

export async function updateContractMetricsForUsers(
  contract: Contract,
  allContractBets: Bet[]
) {
  const batch = firestore.batch()
  const betsByUser = groupBy(allContractBets, 'userId')

  Object.entries(betsByUser).forEach(async ([userId, bets]) => {
    const metrics = calculateUserMetrics(contract, bets)
    batch.update(
      firestore.collection(`users/${userId}/contract-metrics`).doc(contract.id),
      metrics
    )
  })

  await batch.commit()
}
