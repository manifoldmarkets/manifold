import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { getValues } from './utils'
import { Contract } from '../../common/contract'
import { Bet } from '../../common/bet'
import { User } from '../../common/user'
import { calculatePayout } from '../../common/calculate'

const firestore = admin.firestore()

export const updateUserMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const [users, contracts] = await Promise.all([
      getValues<User>(firestore.collection('users')),
      getValues<Contract>(firestore.collection('contracts')),
    ])

    const contractsDict = _.fromPairs(
      contracts.map((contract) => [contract.id, contract])
    )

    await Promise.all(
      users.map(async (user) => {
        const investmentValue = await computeInvestmentValue(
          user,
          contractsDict
        )
        const totalValue = user.balance + investmentValue

        const totalPnL = totalValue - user.totalDeposits

        const creatorVolume = await computeTotalVolume(user, contractsDict)

        return firestore.collection('users').doc(user.id).update({
          totalPnLCached: totalPnL,
          creatorVolumeCached: creatorVolume,
        })
      })
    )
  })

const computeInvestmentValue = async (
  user: User,
  contractsDict: _.Dictionary<Contract>
) => {
  const query = firestore.collectionGroup('bets').where('userId', '==', user.id)
  const bets = await getValues<Bet>(query)

  return _.sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    return calculatePayout(contract, bet, 'MKT')
  })
}

const computeTotalVolume = async (
  user: User,
  contractsDict: _.Dictionary<Contract>
) => {
  const creatorContracts = Object.values(contractsDict).filter(
    (contract) => contract.creatorId === user.id
  )
  const volumes = await Promise.all(creatorContracts.map(computeVolume))
  return _.sum(volumes)
}

const computeVolume = async (contract: Contract) => {
  const bets = await getValues<Bet>(
    firestore.collection(`contracts/${contract.id}/bets`)
  )
  return _.sumBy(bets, (bet) => Math.abs(bet.amount))
}
