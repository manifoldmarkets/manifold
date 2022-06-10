import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, sum, sumBy } from 'lodash'

import { getValues } from './utils'
import { Contract } from '../../common/contract'
import { Bet } from '../../common/bet'
import { User } from '../../common/user'
import { batchedWaitAll } from '../../common/util/promise'
import { calculatePayout } from '../../common/calculate'

const firestore = admin.firestore()

export const updateUserMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const [users, contracts, bets] = await Promise.all([
      getValues<User>(firestore.collection('users')),
      getValues<Contract>(firestore.collection('contracts')),
      firestore.collectionGroup('bets').get(),
    ])

    const contractsDict = Object.fromEntries(
      contracts.map((contract) => [contract.id, contract])
    )

    const betsByUser = groupBy(
      bets.docs.map((doc) => doc.data() as Bet),
      (bet) => bet.userId
    )

    await batchedWaitAll(
      users.map((user) => async () => {
        const investmentValue = computeInvestmentValue(
          betsByUser[user.id] ?? [],
          contractsDict
        )
        const creatorVolume = computeTotalPool(user, contractsDict)
        const totalValue = user.balance + investmentValue
        const totalPnL = totalValue - user.totalDeposits

        await firestore.collection('users').doc(user.id).update({
          totalPnLCached: totalPnL,
          creatorVolumeCached: creatorVolume,
        })
      })
    )
  })

const computeInvestmentValue = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract }
) => {
  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    const payout = calculatePayout(contract, bet, 'MKT')
    return payout - (bet.loanAmount ?? 0)
  })
}

const computeTotalPool = (
  user: User,
  contractsDict: { [k: string]: Contract }
) => {
  const creatorContracts = Object.values(contractsDict).filter(
    (contract) => contract.creatorId === user.id
  )
  const pools = creatorContracts.map((contract) =>
    sum(Object.values(contract.pool))
  )
  return sum(pools)
}

// const computeVolume = async (contract: Contract) => {
//   const bets = await getValues<Bet>(
//     firestore.collection(`contracts/${contract.id}/bets`)
//   )
//   return sumBy(bets, (bet) => Math.abs(bet.amount))
// }
