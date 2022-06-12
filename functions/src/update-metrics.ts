import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, max, sum, sumBy } from 'lodash'

import { getValues, log, logMemory, mapAsync } from './utils'
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
    firestore.collectionGroup('bets').get(),
  ])
  log(
    `Loaded ${users.length} users, ${contracts.length} contracts, and ${bets.docs.length} bets.`
  )
  logMemory()

  await mapAsync(contracts, async (contract) => {
    const [volume24Hours, volume7Days] = await computeVolumes(contract.id, [
      oneDay,
      oneDay * 7,
    ])
    return await firestore.collection('contracts').doc(contract.id).update({
      volume24Hours,
      volume7Days,
    })
  })
  log(`Updated metrics for ${contracts.length} contracts.`)

  const contractsDict = Object.fromEntries(
    contracts.map((contract) => [contract.id, contract])
  )

  const betsByUser = groupBy(
    bets.docs.map((doc) => doc.data() as Bet),
    (bet) => bet.userId
  )

  await mapAsync(users, async (user) => {
    const investmentValue = computeInvestmentValue(
      betsByUser[user.id] ?? [],
      contractsDict
    )
    const creatorVolume = computeTotalPool(user, contractsDict)
    const totalValue = user.balance + investmentValue
    const totalPnL = totalValue - user.totalDeposits
    return await firestore.collection('users').doc(user.id).update({
      totalPnLCached: totalPnL,
      creatorVolumeCached: creatorVolume,
    })
  })
  log(`Updated metrics for ${users.length} users.`)
}

const computeVolumes = async (contractId: string, durationsMs: number[]) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const longestDurationMs = max(durationsMs)!
  const allBets = await getValues<Bet>(
    firestore
      .collection(`contracts/${contractId}/bets`)
      .where('createdTime', '>', Date.now() - longestDurationMs)
  )
  return durationsMs.map((duration) => {
    const cutoff = Date.now() - duration
    const bets = allBets.filter((b) => b.createdTime > cutoff)
    return sumBy(bets, (bet) => (bet.isRedemption ? 0 : Math.abs(bet.amount)))
  })
}

export const updateMetrics = functions
  .runWith({ memory: '1GB' })
  .pubsub.schedule('every 15 minutes')
  .onRun(updateMetricsCore)
