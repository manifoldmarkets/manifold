import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, isEmpty, keyBy, last } from 'lodash'
import { getValues, log, logMemory, writeAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { PortfolioMetrics, User } from '../../common/user'
import { DAY_MS } from '../../common/util/time'
import { getLoanUpdates } from '../../common/loans'
import {
  calculateCreatorVolume,
  calculateNewPortfolioMetrics,
  calculateNewProfit,
  computeVolume,
} from '../../common/calculate-metrics'

const firestore = admin.firestore()

export const updateMetrics = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 15 minutes')
  .onRun(updateMetricsCore)

export async function updateMetricsCore() {
  const [users, contracts, bets, allPortfolioHistories] = await Promise.all([
    getValues<User>(firestore.collection('users')),
    getValues<Contract>(firestore.collection('contracts')),
    getValues<Bet>(firestore.collectionGroup('bets')),
    getValues<PortfolioMetrics>(
      firestore
        .collectionGroup('portfolioHistory')
        .where('timestamp', '>', Date.now() - 31 * DAY_MS) // so it includes just over a month ago
    ),
  ])
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
      return {
        doc: firestore.collection('contracts').doc(contract.id),
        fields: {
          volume24Hours: computeVolume(contractBets, now - DAY_MS),
          volume7Days: computeVolume(contractBets, now - DAY_MS * 7),
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

    return {
      user,
      newCreatorVolume,
      newPortfolio,
      newProfit,
      didPortfolioChange,
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
    ({
      user,
      newCreatorVolume,
      newPortfolio,
      newProfit,
      didPortfolioChange,
    }) => {
      const nextLoanCached = nextLoanByUser[user.id]?.payout ?? 0
      return {
        fieldUpdates: {
          doc: firestore.collection('users').doc(user.id),
          fields: {
            creatorVolumeCached: newCreatorVolume,
            profitCached: newProfit,
            nextLoanCached,
          },
        },

        subcollectionUpdates: {
          doc: firestore
            .collection('users')
            .doc(user.id)
            .collection('portfolioHistory')
            .doc(),
          fields: didPortfolioChange ? newPortfolio : {},
        },
      }
    }
  )
  await writeAsync(
    firestore,
    userUpdates.map((u) => u.fieldUpdates)
  )
  await writeAsync(
    firestore,
    userUpdates
      .filter((u) => !isEmpty(u.subcollectionUpdates.fields))
      .map((u) => u.subcollectionUpdates),
    'set'
  )
  log(`Updated metrics for ${users.length} users.`)
}
