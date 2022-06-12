import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, max, sum, sumBy } from 'lodash'

import { getValues, log, logMemory, mapAsync, writeUpdatesAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { calculatePayout } from '../../common/calculate'

const firestore = admin.firestore()

const oneDay = 1000 * 60 * 60 * 24

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

export const updateMetricsCore = async () => {
  const [users, contracts, bets] = await Promise.all([
    getValues<User>(firestore.collection('users')),
    getValues<Contract>(firestore.collection('contracts')),
    getValues<Bet>(firestore.collectionGroup('bets')),
  ])
  log(
    `Loaded ${users.length} users, ${contracts.length} contracts, and ${bets.length} bets.`
  )
  logMemory()

  const betsByContract = groupBy(bets, (bet) => bet.contractId)
  const contractUpdates = await mapAsync(contracts, async (contract) => {
    const contractBets = betsByContract[contract.id] ?? []
    return {
      doc: firestore.collection('contracts').doc(contract.id),
      fields: {
        volume24Hours: computeVolume(contractBets, oneDay),
        volume7Days: computeVolume(contractBets, oneDay * 7),
      },
    }
  })
  log(`Recomputed metrics for ${contracts.length} contracts.`)

  await writeUpdatesAsync(firestore, contractUpdates)
  log(`Updated metrics for ${contracts.length} contracts.`)

  const contractsDict = Object.fromEntries(
    contracts.map((contract) => [contract.id, contract])
  )

  const betsByUser = groupBy(bets, (bet) => bet.userId)
  const userUpdates = users.map((user) => {
    const investmentValue = computeInvestmentValue(
      betsByUser[user.id] ?? [],
      contractsDict
    )
    const creatorVolume = computeTotalPool(user, contractsDict)
    const totalValue = user.balance + investmentValue
    const totalPnL = totalValue - user.totalDeposits
    return {
      doc: firestore.collection('users').doc(user.id),
      fields: {
        totalPnLCached: totalPnL,
        creatorVolumeCached: creatorVolume,
      },
    }
  })
  log(`Recomputed metrics for ${users.length} users.`)

  await writeUpdatesAsync(firestore, userUpdates)
  log(`Updated metrics for ${users.length} users.`)
}

const computeVolume = async (contractBets: Bet[], duration: number) => {
  const cutoff = Date.now() - duration
  const bets = contractBets.filter((b) => b.createdTime > cutoff)
  return sumBy(bets, (bet) => (bet.isRedemption ? 0 : Math.abs(bet.amount)))
}

export const updateMetrics = functions
  .runWith({ memory: '1GB' })
  .pubsub.schedule('every 15 minutes')
  .onRun(updateMetricsCore)
