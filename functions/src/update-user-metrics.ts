import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { sum, sumBy } from 'lodash'

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
    const [users, contracts] = await Promise.all([
      getValues<User>(firestore.collection('users')),
      getValues<Contract>(firestore.collection('contracts')),
    ])

    const contractsDict = Object.fromEntries(
      contracts.map((contract) => [contract.id, contract])
    )

    await batchedWaitAll(
      users.map((user) => async () => {
        const [investmentValue, creatorVolume] = await Promise.all([
          computeInvestmentValue(user, contractsDict),
          computeTotalPool(user, contractsDict),
        ])

        const totalValue = user.balance + investmentValue
        const totalPnL = totalValue - user.totalDeposits

        await firestore.collection('users').doc(user.id).update({
          totalPnLCached: totalPnL,
          creatorVolumeCached: creatorVolume,
        })
      })
    )
  })

const computeInvestmentValue = async (
  user: User,
  contractsDict: { [k: string]: Contract }
) => {
  const query = firestore.collectionGroup('bets').where('userId', '==', user.id)
  const bets = await getValues<Bet>(query)

  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    const payout = calculatePayout(contract, bet, 'MKT')
    return payout - (bet.loanAmount ?? 0)
  })
}

const computeTotalPool = async (
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

const computeVolume = async (contract: Contract) => {
  const bets = await getValues<Bet>(
    firestore.collection(`contracts/${contract.id}/bets`)
  )
  return sumBy(bets, (bet) => Math.abs(bet.amount))
}
