import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { difference, uniq, mapValues, groupBy, sumBy } from 'lodash'

import { Contract, resolution } from '../../common/contract'
import { User } from '../../common/user'
import { Bet } from '../../common/bet'
import { getUser, isProd, payUser } from './utils'
import { sendMarketResolutionEmail } from './emails'
import {
  getLoanPayouts,
  getPayouts,
  groupPayoutsByUser,
  Payout,
} from '../../common/payouts'
import { removeUndefinedProps } from '../../common/util/object'
import { LiquidityProvision } from '../../common/liquidity-provision'
import { getValues } from './utils'
import { batchedWaitAll } from '../../common/util/promise'
import { getProbability } from 'common/calculate'

export const resolveMarket = functions
  .runWith({ minInstances: 1 })
  .https.onCall(
    async (
      data: {
        outcome: resolution
        value?: number
        contractId: string
        probabilityInt?: number
        resolutions?: { [outcome: string]: number }
      },
      context
    ) => {
      const userId = context?.auth?.uid
      if (!userId) return { status: 'error', message: 'Not authorized' }
      const contractDoc = firestore.doc(`contracts/${data.contractId}`)
      const contractSnap = await contractDoc.get()
      if (!contractSnap.exists)
        return { status: 'error', message: 'Invalid contract' }
      const contract = contractSnap.data() as Contract
      if (contract.creatorId !== userId)
        return { status: 'error', message: 'User not creator of contract' }

      return resolveContract(contract, data, contractDoc)
    }
  )

export const autoResolveMarkets = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const contracts = await getValues<Contract>(
      firestore.collection('contracts')
    )

    const contractsToResolve = contracts
      .filter((c) => !c.isResolved)
      .filter((c) => c.autoResolutionTime < Date.now())

    await batchedWaitAll(
      contractsToResolve.map((contract) => async () => {
        const result = await resolve(contract)

        console.log(
          'resolved',
          contract.slug,
          contract.autoResolution,
          'result:',
          result
        )
      })
    )
  })

const resolve = async (contract: Contract) => {
  const data = {
    outcome: contract.autoResolution,
    value: undefined, // numeric
    probabilityInt:
      contract.outcomeType == 'BINARY'
        ? getProbability(contract) * 100
        : undefined,
    resolutions: undefined, // free response
  }
  const contractDoc = firestore.doc(`contracts/${contract.id}`)
  return await resolveContract(contract, data, contractDoc)
}

const resolveContract = async (
  contract: Contract,
  data: {
    outcome: resolution
    value?: number
    probabilityInt?: number
    resolutions?: { [outcome: string]: number }
  },
  contractDoc: admin.firestore.DocumentReference<admin.firestore.DocumentData>
) => {
  const { creatorId, id, outcomeType, closeTime } = contract
  const { outcome, probabilityInt, resolutions, value } = data
  switch (outcomeType) {
    case 'FREE_RESPONSE':
      if (
        isNaN(+outcome) &&
        !(outcome === 'MKT' && resolutions) &&
        outcome !== 'CANCEL'
      )
        return { status: 'error', message: 'Invalid outcome' }
      break
    case 'NUMERIC':
      if (isNaN(+outcome) && outcome !== 'CANCEL')
        return { status: 'error', message: 'Invalid outcome' }
  }

  if (value !== undefined && !isFinite(value))
    return { status: 'error', message: 'Invalid value' }

  if (
    outcomeType === 'BINARY' &&
    probabilityInt !== undefined &&
    (probabilityInt < 0 || probabilityInt > 100 || !isFinite(probabilityInt))
  )
    return { status: 'error', message: 'Invalid probability' }

  if (contract.resolution)
    return { status: 'error', message: 'Contract already resolved' }

  const creator = await getUser(creatorId)
  if (!creator) return { status: 'error', message: 'Creator not found' }

  const resolutionProbability =
    probabilityInt !== undefined ? probabilityInt / 100 : undefined

  const resolutionTime = Date.now()
  const newCloseTime = closeTime
    ? Math.min(closeTime, resolutionTime)
    : closeTime

  const betsSnap = await firestore.collection(`contracts/${id}/bets`).get()

  const bets = betsSnap.docs.map((doc) => doc.data() as Bet)

  const liquiditiesSnap = await firestore
    .collection(`contracts/${id}/liquidity`)
    .get()

  const liquidities = liquiditiesSnap.docs.map(
    (doc) => doc.data() as LiquidityProvision
  )

  const { payouts, creatorPayout, liquidityPayouts, collectedFees } =
    getPayouts(
      outcome,
      resolutions ?? {},
      contract,
      bets,
      liquidities,
      resolutionProbability
    )

  await contractDoc.update(
    removeUndefinedProps({
      isResolved: true,
      resolution: outcome,
      resolutionValue: value,
      resolutionTime,
      closeTime: newCloseTime,
      resolutionProbability,
      resolutions,
      collectedFees,
    })
  )

  console.log('contract ', id, 'resolved to:', outcome)

  const openBets = bets.filter((b) => !b.isSold && !b.sale)
  const loanPayouts = getLoanPayouts(openBets)

  if (!isProd)
    console.log(
      'payouts:',
      payouts,
      'creator payout:',
      creatorPayout,
      'liquidity payout:'
    )

  if (creatorPayout)
    await processPayouts([{ userId: creatorId, payout: creatorPayout }], true)

  await processPayouts(liquidityPayouts, true)

  const result = await processPayouts([...payouts, ...loanPayouts])

  const userPayoutsWithoutLoans = groupPayoutsByUser(payouts)

  await sendResolutionEmails(
    openBets,
    userPayoutsWithoutLoans,
    creator,
    creatorPayout,
    contract,
    outcome,
    resolutionProbability,
    resolutions
  )

  return result
}

const processPayouts = async (payouts: Payout[], isDeposit = false) => {
  const userPayouts = groupPayoutsByUser(payouts)

  const payoutPromises = Object.entries(userPayouts).map(([userId, payout]) =>
    payUser(userId, payout, isDeposit)
  )

  return await Promise.all(payoutPromises)
    .catch((e) => ({ status: 'error', message: e }))
    .then(() => ({ status: 'success' }))
}

const sendResolutionEmails = async (
  openBets: Bet[],
  userPayouts: { [userId: string]: number },
  creator: User,
  creatorPayout: number,
  contract: Contract,
  outcome: string,
  resolutionProbability?: number,
  resolutions?: { [outcome: string]: number }
) => {
  const nonWinners = difference(
    uniq(openBets.map(({ userId }) => userId)),
    Object.keys(userPayouts)
  )
  const investedByUser = mapValues(
    groupBy(openBets, (bet) => bet.userId),
    (bets) => sumBy(bets, (bet) => bet.amount)
  )
  const emailPayouts = [
    ...Object.entries(userPayouts),
    ...nonWinners.map((userId) => [userId, 0] as const),
  ].map(([userId, payout]) => ({
    userId,
    investment: investedByUser[userId] ?? 0,
    payout,
  }))

  await Promise.all(
    emailPayouts.map(({ userId, investment, payout }) =>
      sendMarketResolutionEmail(
        userId,
        investment,
        payout,
        creator,
        creatorPayout,
        contract,
        outcome,
        resolutionProbability,
        resolutions
      )
    )
  )
}

const firestore = admin.firestore()
