import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, sum, sumBy } from 'lodash'

import { getValues, log, logMemory, writeUpdatesAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { calculatePayout } from '../../common/calculate'
import { DAY_MS } from '../../common/util/time'

const firestore = admin.firestore()

const oneDay = 1000 * 60 * 60 * 24

const computeInvestmentValue = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract },
  startTime = 0
) => {
  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    const payout = calculatePayout(contract, bet, 'MKT')
    const betTime = bet.createdTime
    if (betTime < startTime || betTime >= Date.now()) return 0

    return payout - (bet.loanAmount ?? 0)
  })
}

const computeTotalPool = (
  user: User,
  userContracts: Contract[],
  startTime = 0
) => {
  const periodFilteredContracts = userContracts.filter(
    (contract) => contract.createdTime >= startTime
  )
  return sum(
    periodFilteredContracts.map((contract) => sum(Object.values(contract.pool)))
  )
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
    const currentBets = betsByUser[user.id] ?? []
    const userContracts = contractsByUser[user.id] ?? []
    const calculatedValues = calculateValuesForUser(
      user,
      contractsById,
      userContracts,
      currentBets
    )
    return {
      doc: firestore.collection('users').doc(user.id),
      fields: {
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

const calculateValuesForUser = (
  user: User,
  contractsDict: { [k: string]: Contract },
  userContracts: Contract[],
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

  const allTimeCreatorVolume = computeTotalPool(user, userContracts, 0)
  const monthlyCreatorVolume = computeTotalPool(
    user,
    userContracts,
    Date.now() - 30 * DAY_MS
  )
  const weeklyCreatorVolume = computeTotalPool(
    user,
    userContracts,
    Date.now() - 7 * DAY_MS
  )

  const dailyCreatorVolume = computeTotalPool(
    user,
    userContracts,
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

export const updateMetrics = functions
  .runWith({ memory: '1GB' })
  .pubsub.schedule('every 15 minutes')
  .onRun(updateMetricsCore)
