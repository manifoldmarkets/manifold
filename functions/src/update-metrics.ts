import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, keyBy, last, sortBy } from 'lodash'
import fetch from 'node-fetch'

import { getValues, log, logMemory, writeAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract, CPMM } from '../../common/contract'
import { PortfolioMetrics, User } from '../../common/user'
import { DAY_MS } from '../../common/util/time'
import { getLoanUpdates } from '../../common/loans'
import { scoreTraders, scoreCreators } from '../../common/scoring'
import {
  calculateCreatorVolume,
  calculateNewPortfolioMetrics,
  calculateNewProfit,
  calculateProbChanges,
  calculateMetricsByContract,
  computeElasticity,
  computeVolume,
} from '../../common/calculate-metrics'
import { getProbability } from '../../common/calculate'
import { Group } from '../../common/group'
import { batchedWaitAll } from '../../common/util/promise'
import { newEndpointNoAuth } from './api'
import { getFunctionUrl } from '../../common/api'
import { filterDefined } from '../../common/util/array'

const firestore = admin.firestore()
export const scheduleUpdateMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const response = await fetch(getFunctionUrl('updatemetrics'), {
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({}),
    })

    const json = await response.json()

    if (response.ok) console.log(json)
    else console.error(json)
  })

export const updatemetrics = newEndpointNoAuth(
  { timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 },
  async (_req) => {
    await updateMetricsCore()
    return { success: true }
  }
)

export async function updateMetricsCore() {
  console.log('Loading users')
  const users = await getValues<User>(firestore.collection('users'))

  console.log('Loading contracts')
  const contracts = await getValues<Contract>(firestore.collection('contracts'))

  console.log('Loading portfolio history')
  const allPortfolioHistories = await getValues<PortfolioMetrics>(
    firestore
      .collectionGroup('portfolioHistory')
      .where('timestamp', '>', Date.now() - 31 * DAY_MS) // so it includes just over a month ago
  )

  console.log('Loading groups')
  const groups = await getValues<Group>(firestore.collection('groups'))

  console.log('Loading bets')
  const contractBets = await batchedWaitAll(
    contracts
      .filter((c) => c.id)
      .map(
        (c) => () =>
          getValues<Bet>(
            firestore.collection('contracts').doc(c.id).collection('bets')
          )
      ),
    100
  )
  const bets = contractBets.flat()

  console.log('Loading group contracts')
  const contractsByGroup = await Promise.all(
    groups.map((group) =>
      getValues(
        firestore
          .collection('groups')
          .doc(group.id)
          .collection('groupContracts')
      )
    )
  )
  log(
    `Loaded ${users.length} users, ${contracts.length} contracts, and ${bets.length} bets.`
  )
  logMemory()

  const now = Date.now()
  const betsByContract = groupBy(bets, (bet) => bet.contractId)

  const contractUpdates = contracts
    .filter((contract) => contract.id)
    .map((contract) => {
      const contractBets = betsByContract[contract.id] ?? []
      const descendingBets = sortBy(
        contractBets,
        (bet) => bet.createdTime
      ).reverse()

      let cpmmFields: Partial<CPMM> = {}
      if (contract.mechanism === 'cpmm-1') {
        const prob = descendingBets[0]
          ? descendingBets[0].probAfter
          : getProbability(contract)

        cpmmFields = {
          prob,
          probChanges: calculateProbChanges(descendingBets),
        }
      }

      return {
        doc: firestore.collection('contracts').doc(contract.id),
        fields: {
          volume24Hours: computeVolume(contractBets, now - DAY_MS),
          volume7Days: computeVolume(contractBets, now - DAY_MS * 7),
          elasticity: computeElasticity(contractBets, contract),
          ...cpmmFields,
        },
      }
    })
  await writeAsync(firestore, contractUpdates)
  log(`Updated metrics for ${contracts.length} contracts.`)

  const contractsById = Object.fromEntries(
    contracts.map((contract) => [contract.id, contract])
  )
  const contractsByUser = groupBy(contracts, (contract) => contract.creatorId)
  const betsByUser = groupBy(bets, (bet) => bet.userId)
  const portfolioHistoryByUser = groupBy(allPortfolioHistories, (p) => p.userId)

  const userMetrics = users.map((user) => {
    const currentBets = betsByUser[user.id] ?? []
    const portfolioHistory = portfolioHistoryByUser[user.id] ?? []
    const userContracts = contractsByUser[user.id] ?? []
    const newCreatorVolume = calculateCreatorVolume(userContracts)
    const newPortfolio = calculateNewPortfolioMetrics(
      user,
      contractsById,
      currentBets
    )
    const lastPortfolio = last(portfolioHistory)
    const didPortfolioChange =
      lastPortfolio === undefined ||
      lastPortfolio.balance !== newPortfolio.balance ||
      lastPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
      lastPortfolio.investmentValue !== newPortfolio.investmentValue

    const newProfit = calculateNewProfit(portfolioHistory, newPortfolio)

    const metricsByContract = calculateMetricsByContract(
      currentBets,
      contractsById
    )

    const contractRatios = userContracts
      .map((contract) => {
        if (
          !contract.flaggedByUsernames ||
          contract.flaggedByUsernames?.length === 0
        ) {
          return 0
        }
        const contractRatio =
          contract.flaggedByUsernames.length / (contract.uniqueBettorCount || 1)

        return contractRatio
      })
      .filter((ratio) => ratio > 0)
    const badResolutions = contractRatios.filter(
      (ratio) => ratio > BAD_RESOLUTION_THRESHOLD
    )
    let newFractionResolvedCorrectly = 0
    if (userContracts.length > 0) {
      newFractionResolvedCorrectly =
        (userContracts.length - badResolutions.length) / userContracts.length
    }

    return {
      user,
      newCreatorVolume,
      newPortfolio,
      newProfit,
      didPortfolioChange,
      newFractionResolvedCorrectly,
      metricsByContract,
    }
  })

  const portfolioByUser = Object.fromEntries(
    userMetrics.map(({ user, newPortfolio }) => [user.id, newPortfolio])
  )
  const { userPayouts } = getLoanUpdates(
    users,
    contractsById,
    portfolioByUser,
    betsByUser
  )
  const nextLoanByUser = keyBy(userPayouts, (payout) => payout.user.id)

  const userUpdates = userMetrics.map(
    ({ user, newCreatorVolume, newProfit, newFractionResolvedCorrectly }) => {
      const nextLoanCached = nextLoanByUser[user.id]?.payout ?? 0
      return {
        doc: firestore.collection('users').doc(user.id),
        fields: {
          creatorVolumeCached: newCreatorVolume,
          profitCached: newProfit,
          nextLoanCached,
          fractionResolvedCorrectly: newFractionResolvedCorrectly,
        },
      }
    }
  )
  await writeAsync(firestore, userUpdates)

  const portfolioHistoryUpdates = filterDefined(
    userMetrics.map(({ user, newPortfolio, didPortfolioChange }) => {
      return didPortfolioChange
        ? {
            doc: firestore
              .collection('users')
              .doc(user.id)
              .collection('portfolioHistory')
              .doc(),
            fields: newPortfolio,
          }
        : null
    })
  )
  await writeAsync(firestore, portfolioHistoryUpdates, 'set')

  const contractMetricsUpdates = userMetrics.flatMap(
    ({ user, metricsByContract }) => {
      const collection = firestore
        .collection('users')
        .doc(user.id)
        .collection('contract-metrics')
      return metricsByContract.map((metrics) => ({
        doc: collection.doc(metrics.contractId),
        fields: metrics,
      }))
    }
  )

  await writeAsync(firestore, contractMetricsUpdates, 'set')

  log(`Updated metrics for ${users.length} users.`)

  try {
    const groupUpdates = groups.map((group, index) => {
      const groupContractIds = contractsByGroup[index] as GroupContractDoc[]
      const groupContracts = filterDefined(
        groupContractIds.map((e) => contractsById[e.contractId])
      )
      const bets = groupContracts.map((e) => betsByContract[e.id] ?? [])

      const creatorScores = scoreCreators(groupContracts)
      const traderScores = scoreTraders(groupContracts, bets)

      const topTraderScores = topUserScores(traderScores)
      const topCreatorScores = topUserScores(creatorScores)

      return {
        doc: firestore.collection('groups').doc(group.id),
        fields: {
          cachedLeaderboard: {
            topTraders: topTraderScores,
            topCreators: topCreatorScores,
          },
        },
      }
    })
    await writeAsync(firestore, groupUpdates)
  } catch (e) {
    console.log('Error While Updating Group Leaderboards', e)
  }
}

const topUserScores = (scores: { [userId: string]: number }) => {
  const top50 = Object.entries(scores)
    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
    .slice(0, 50)
  return top50.map(([userId, score]) => ({ userId, score }))
}

type GroupContractDoc = { contractId: string; createdTime: number }

const BAD_RESOLUTION_THRESHOLD = 0.1
