import * as admin from 'firebase-admin'
import { z } from 'zod'
import { mapValues, groupBy, sumBy } from 'lodash'

import {
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
  RESOLUTIONS,
} from '../../common/contract'
import { Bet } from '../../common/bet'
import { getContractPath, getUser, getValues, isProd, log, payUser, revalidateStaticProps } from './utils'
import {
  getLoanPayouts,
  getPayouts,
  groupPayoutsByUser,
  Payout,
} from '../../common/payouts'
import { isAdmin, isManifoldId } from '../../common/envs/constants'
import { removeUndefinedProps } from '../../common/util/object'
import { LiquidityProvision } from '../../common/liquidity-provision'
import { APIError, newEndpoint, validate } from './api'
import { getContractBetMetrics } from '../../common/calculate'
import { createContractResolvedNotifications } from './create-notification'
import { CancelUniqueBettorBonusTxn, Txn } from '../../common/txn'
import { runTxn, TxnData } from './transact'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from '../../common/antes'

const bodySchema = z.object({
  contractId: z.string(),
})

const binarySchema = z.object({
  outcome: z.enum(RESOLUTIONS),
  probabilityInt: z.number().gte(0).lte(100).optional(),
})

const freeResponseSchema = z.union([
  z.object({
    outcome: z.literal('CANCEL'),
  }),
  z.object({
    outcome: z.literal('MKT'),
    resolutions: z.array(
      z.object({
        answer: z.number().int().nonnegative(),
        pct: z.number().gte(0).lte(100),
      })
    ),
  }),
  z.object({
    outcome: z.number().int().nonnegative(),
  }),
])

const numericSchema = z.object({
  outcome: z.union([z.literal('CANCEL'), z.string()]),
  value: z.number().optional(),
})

const pseudoNumericSchema = z.union([
  z.object({
    outcome: z.literal('CANCEL'),
  }),
  z.object({
    outcome: z.literal('MKT'),
    value: z.number(),
    probabilityInt: z.number().gte(0).lte(100),
  }),
])

const opts = { secrets: ['MAILGUN_KEY'] }

export const resolvemarket = newEndpoint(opts, async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists)
    throw new APIError(404, 'No contract exists with the provided ID')
  const contract = contractSnap.data() as Contract
  const { creatorId, closeTime } = contract
  const firebaseUser = await admin.auth().getUser(auth.uid)

  const { value, resolutions, probabilityInt, outcome } = getResolutionParams(
    contract,
    req.body
  )

  if (
    creatorId !== auth.uid &&
    !isManifoldId(auth.uid) &&
    !isAdmin(firebaseUser.email)
  )
    throw new APIError(403, 'User is not creator of contract')

  if (contract.resolution) throw new APIError(400, 'Contract already resolved')

  const creator = await getUser(creatorId)
  if (!creator) throw new APIError(500, 'Creator not found')

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
      contract,
      bets,
      liquidities,
      resolutions,
      resolutionProbability
    )

  const updatedContract = {
    ...contract,
    ...removeUndefinedProps({
      isResolved: true,
      resolution: outcome,
      resolutionValue: value,
      resolutionTime,
      closeTime: newCloseTime,
      resolutionProbability,
      resolutions,
      collectedFees,
    }),
  }

  await contractDoc.update(updatedContract)

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
  await undoUniqueBettorRewardsIfCancelResolution(contract, outcome)

  await revalidateStaticProps(getContractPath(contract))

  const userPayoutsWithoutLoans = groupPayoutsByUser(payouts)

  const userInvestments = mapValues(
    groupBy(bets, (bet) => bet.userId),
    (bets) => getContractBetMetrics(contract, bets).invested
  )

  await createContractResolvedNotifications(
    contract,
    creator,
    outcome,
    probabilityInt,
    value,
    {
      bets,
      userInvestments,
      userPayouts: userPayoutsWithoutLoans,
      creator,
      creatorPayout,
      contract,
      outcome,
      resolutionProbability,
      resolutions,
    }
  )

  return updatedContract
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

function getResolutionParams(contract: Contract, body: string) {
  const { outcomeType } = contract

  if (outcomeType === 'NUMERIC') {
    return {
      ...validate(numericSchema, body),
      resolutions: undefined,
      probabilityInt: undefined,
    }
  } else if (outcomeType === 'PSEUDO_NUMERIC') {
    return {
      ...validate(pseudoNumericSchema, body),
      resolutions: undefined,
    }
  } else if (
    outcomeType === 'FREE_RESPONSE' ||
    outcomeType === 'MULTIPLE_CHOICE'
  ) {
    const freeResponseParams = validate(freeResponseSchema, body)
    const { outcome } = freeResponseParams
    switch (outcome) {
      case 'CANCEL':
        return {
          outcome: outcome.toString(),
          resolutions: undefined,
          value: undefined,
          probabilityInt: undefined,
        }
      case 'MKT': {
        const { resolutions } = freeResponseParams
        resolutions.forEach(({ answer }) => validateAnswer(contract, answer))
        const pctSum = sumBy(resolutions, ({ pct }) => pct)
        if (Math.abs(pctSum - 100) > 0.1) {
          throw new APIError(400, 'Resolution percentages must sum to 100')
        }
        return {
          outcome: outcome.toString(),
          resolutions: Object.fromEntries(
            resolutions.map((r) => [r.answer, r.pct])
          ),
          value: undefined,
          probabilityInt: undefined,
        }
      }
      default: {
        validateAnswer(contract, outcome)
        return {
          outcome: outcome.toString(),
          resolutions: undefined,
          value: undefined,
          probabilityInt: undefined,
        }
      }
    }
  } else if (outcomeType === 'BINARY') {
    return {
      ...validate(binarySchema, body),
      value: undefined,
      resolutions: undefined,
    }
  }
  throw new APIError(500, `Invalid outcome type: ${outcomeType}`)
}

function validateAnswer(
  contract: FreeResponseContract | MultipleChoiceContract,
  answer: number
) {
  const validIds = contract.answers.map((a) => a.id)
  if (!validIds.includes(answer.toString())) {
    throw new APIError(400, `${answer} is not a valid answer ID`)
  }
}

async function undoUniqueBettorRewardsIfCancelResolution(
  contract: Contract,
  outcome: string
) {
  if (outcome === 'CANCEL') {
    const creatorsBonusTxns = await getValues<Txn>(
      firestore
        .collection('txns')
        .where('category', '==', 'UNIQUE_BETTOR_BONUS')
        .where('toId', '==', contract.creatorId)
    )

    const bonusTxnsOnThisContract = creatorsBonusTxns.filter(
      (txn) => txn.data && txn.data.contractId === contract.id
    )
    log('total bonusTxnsOnThisContract', bonusTxnsOnThisContract.length)
    const totalBonusAmount = sumBy(bonusTxnsOnThisContract, (txn) => txn.amount)
    log('totalBonusAmount to be withdrawn', totalBonusAmount)
    const result = await firestore.runTransaction(async (trans) => {
      const bonusTxn: TxnData = {
        fromId: contract.creatorId,
        fromType: 'USER',
        toId: isProd()
          ? HOUSE_LIQUIDITY_PROVIDER_ID
          : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
        toType: 'BANK',
        amount: totalBonusAmount,
        token: 'M$',
        category: 'CANCEL_UNIQUE_BETTOR_BONUS',
        data: {
          contractId: contract.id,
        },
      } as Omit<CancelUniqueBettorBonusTxn, 'id' | 'createdTime'>
      return await runTxn(trans, bonusTxn)
    })

    if (result.status != 'success' || !result.txn) {
      log(
        `Couldn't cancel bonus for user: ${contract.creatorId} - status:`,
        result.status
      )
      log('message:', result.message)
    } else {
      log(
        `Cancel Bonus txn for user: ${contract.creatorId} completed:`,
        result.txn?.id
      )
    }
  }
}

const firestore = admin.firestore()
