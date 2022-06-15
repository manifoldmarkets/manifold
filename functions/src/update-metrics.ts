import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, sum, sumBy } from 'lodash'

import { getValues, log, logMemory, writeUpdatesAsync } from './utils'
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

const computeTotalPool = (contracts: Contract[]) => {
  return sum(contracts.map((contract) => sum(Object.values(contract.pool))))
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

  const now = Date.now()
  const betsByContract = groupBy(bets, (bet) => bet.contractId)
  const contractUpdates = contracts.map((contract) => {
    const contractBets = betsByContract[contract.id] ?? []
    return {
      doc: firestore.collection('contracts').doc(contract.id),
      fields: {
        volume24Hours: computeVolume(contractBets, now - oneDay),
        volume7Days: computeVolume(contractBets, now - oneDay * 7),
      },
    }
  })
  await writeUpdatesAsync(firestore, contractUpdates)
  log(`Updated metrics for ${contracts.length} contracts.`)

  const contractsById = Object.fromEntries(
    contracts.map((contract) => [contract.id, contract])
  )
  const contractsByUser = groupBy(contracts, (contract) => contract.creatorId)
  const betsByUser = groupBy(bets, (bet) => bet.userId)
  const userUpdates = users.map((user) => {
    const investmentValue = computeInvestmentValue(
      betsByUser[user.id] ?? [],
      contractsById
    )
    const creatorContracts = contractsByUser[user.id] ?? []
    const creatorVolume = computeTotalPool(creatorContracts)
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
  await writeUpdatesAsync(firestore, userUpdates)
  log(`Updated metrics for ${users.length} users.`)
}

const computeVolume = (contractBets: Bet[], since: number) => {
  return sumBy(contractBets, (b) =>
    b.createdTime > since && !b.isRedemption ? Math.abs(b.amount) : 0
  )
}

export const updateMetrics = functions
  .runWith({ memory: '1GB' })
  .pubsub.schedule('every 15 minutes')
  .onRun(updateMetricsCore)
