import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, sum, sumBy } from 'lodash'

import { getValues, log, logMemory, mapAsync } from './utils'
import { Contract } from '../../common/contract'
import { Bet } from '../../common/bet'
import { User } from '../../common/user'
import { calculatePayout } from '../../common/calculate'

const firestore = admin.firestore()
const DAY_MS = 24 * 60 * 60 * 1000

const computeInvestmentValue = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract },
  startTime: number = 0
) => {
  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    const payout = calculatePayout(contract, bet, 'MKT')
    const betTime = bet.createdTime ?? 0
    if (betTime < startTime || betTime >= Date.now()) return 0

    return payout - (bet.loanAmount ?? 0)
  })
}

const computeTotalPool = (
  user: User,
  contractsDict: { [k: string]: Contract },
  startTime: number = 0
) => {
  const creatorContracts = Object.values(contractsDict).filter(
    (contract) =>
      contract.creatorId === user.id && contract.createdTime >= startTime
  )
  const pools = creatorContracts.map((contract) =>
    sum(Object.values(contract.pool))
  )
  return sum(pools)
}

export const updateUserMetricsCore = async () => {
  const [users, contracts, bets] = await Promise.all([
    getValues<User>(firestore.collection('users')),
    getValues<Contract>(firestore.collection('contracts')),
    firestore.collectionGroup('bets').get(),
  ])
  log(
    `Loaded ${users.length} users, ${contracts.length} contracts, and ${bets.docs.length} bets.`
  )
  logMemory()

  const contractsDict = Object.fromEntries(
    contracts.map((contract) => [contract.id, contract])
  )

  const betsByUser = groupBy(
    bets.docs.map((doc) => doc.data() as Bet),
    (bet) => bet.userId
  )

  await mapAsync(users, async (user) => {
    const currentBets = betsByUser[user.id] ?? []
    const calculatedValues = calculateValuesForUser(
      user,
      contractsDict,
      currentBets
    )

    return await firestore
      .collection('users')
      .doc(user.id)
      .update({
        totalPnLCached: {
          daily: calculatedValues.dailyInvestmentValue,
          weekly: calculatedValues.weeklyInvestmentValue,
          monthly: calculatedValues.monthlyInvestmentValue,
          allTime:
            calculatedValues.allTimeInvestmentValue +
            user.balance -
            user.totalDeposits,
        },
        creatorVolumeCached: {
          daily: calculatedValues.dailyCreatorVolume,
          weekly: calculatedValues.weeklyCreatorVolume,
          monthly: calculatedValues.monthlyCreatorVolume,
          allTime: calculatedValues.allTimeCreatorVolume,
        },
      })
  })
  log(`Updated metrics for ${users.length} users.`)
}

const calculateValuesForUser = (
  user: User,
  contractsDict: { [k: string]: Contract },
  currentBets: Bet[]
) => {
  const allTimeInvestmentValue = computeInvestmentValue(
    currentBets,
    contractsDict,
    0
  )

  const dailyInvestmentValue = computeInvestmentValue(
    currentBets,
    contractsDict,
    Date.now() - 1 * DAY_MS
  )

  const monthlyInvestmentValue = computeInvestmentValue(
    currentBets,
    contractsDict,
    Date.now() - 30 * DAY_MS
  )

  const weeklyInvestmentValue = computeInvestmentValue(
    currentBets,
    contractsDict,
    Date.now() - 7 * DAY_MS
  )

  const allTimeCreatorVolume = computeTotalPool(user, contractsDict, 0)
  const monthlyCreatorVolume = computeTotalPool(
    user,
    contractsDict,
    Date.now() - 30 * DAY_MS
  )
  const weeklyCreatorVolume = computeTotalPool(
    user,
    contractsDict,
    Date.now() - 7 * DAY_MS
  )

  const dailyCreatorVolume = computeTotalPool(
    user,
    contractsDict,
    Date.now() - 1 * DAY_MS
  )

  return {
    allTimeInvestmentValue,
    dailyInvestmentValue,
    monthlyInvestmentValue,
    weeklyInvestmentValue,
    allTimeCreatorVolume,
    monthlyCreatorVolume,
    weeklyCreatorVolume,
    dailyCreatorVolume,
  }
}

export const updateUserMetrics = functions
  .runWith({ memory: '1GB' })
  .pubsub.schedule('every 15 minutes')
  .onRun(updateUserMetricsCore)
