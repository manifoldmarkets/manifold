import * as admin from 'firebase-admin'
import { z } from 'zod'
import { difference, uniq, mapValues, groupBy, sumBy } from 'lodash'

import { Contract, RESOLUTIONS } from '../../common/contract'
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
import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  outcome: z.enum(RESOLUTIONS),
  contractId: z.string(),
  value: z.number().optional(),
  probabilityInt: z.number().gte(0).lt(100).optional(),
  resolutions: z.map(z.string(), z.number()).optional(),
})

export const resolvemarket = newEndpoint(['POST'], async (req, auth) => {
  const { outcome, value, contractId, probabilityInt, resolutions } = validate(
    bodySchema,
    req.body
  )
  const userId = auth.uid
  if (!userId) throw new APIError(403, 'Not authorized')

  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists)
    throw new APIError(404, 'No contract exists with the provided ID')
  const contract = contractSnap.data() as Contract
  const { creatorId, outcomeType, closeTime } = contract

  if (outcomeType === 'FREE_RESPONSE') {
    if (
      isNaN(+outcome) &&
      !(outcome === 'MKT' && resolutions) &&
      outcome !== 'CANCEL'
    )
      throw new APIError(400, 'Invalid free response outcome')
  } else if (outcomeType === 'NUMERIC') {
    if (isNaN(+outcome) && outcome !== 'CANCEL')
      throw new APIError(400, 'Invalid numeric outcome')
  }

  if (value !== undefined && !isFinite(value))
    throw new APIError(400, 'Invalid value')

  if (
    outcomeType === 'BINARY' &&
    probabilityInt !== undefined &&
    (probabilityInt < 0 || probabilityInt > 100 || !isFinite(probabilityInt))
  )
    throw new APIError(400, 'Invalid probability')

  if (creatorId !== userId)
    throw new APIError(403, 'User is not creator of contract')

  if (contract.resolution) throw new APIError(400, 'Contract already resolved')

  const creator = await getUser(creatorId)
  if (!creator) throw new APIError(400, 'Creator not found')

  const resolutionProbability =
    probabilityInt !== undefined ? probabilityInt / 100 : undefined

  const resolutionTime = Date.now()
  const newCloseTime = closeTime
    ? Math.min(closeTime, resolutionTime)
    : closeTime

  const betsSnap = await firestore
    .collection(`contracts/${contractId}/bets`)
    .get()

  const bets = betsSnap.docs.map((doc) => doc.data() as Bet)

  const liquiditiesSnap = await firestore
    .collection(`contracts/${contractId}/liquidity`)
    .get()

  const liquidities = liquiditiesSnap.docs.map(
    (doc) => doc.data() as LiquidityProvision
  )

  const { payouts, creatorPayout, liquidityPayouts, collectedFees } =
    getPayouts(
      outcome,
      Object.fromEntries(resolutions || []),
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

  console.log('contract ', contractId, 'resolved to:', outcome)

  const openBets = bets.filter((b) => !b.isSold && !b.sale)
  const loanPayouts = getLoanPayouts(openBets)

  if (!isProd())
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

  await processPayouts([...payouts, ...loanPayouts])

  const userPayoutsWithoutLoans = groupPayoutsByUser(payouts)

  await sendResolutionEmails(
    openBets,
    userPayoutsWithoutLoans,
    creator,
    creatorPayout,
    contract,
    outcome,
    resolutionProbability,
    Object.fromEntries(resolutions || [])
  )

  const updatedContractSnap = await contractDoc.get()
  if (!updatedContractSnap)
    throw new APIError(500, 'Updated contract does not exist')
  return updatedContractSnap.data() as Contract
})

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
