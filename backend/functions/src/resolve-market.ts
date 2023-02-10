import * as admin from 'firebase-admin'
import { z } from 'zod'
import { chunk, mapValues, groupBy, sumBy, sum } from 'lodash'

import {
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
  RESOLUTIONS,
} from 'common/contract'
import { Bet } from 'common/bet'
import {
  getContractPath,
  getUser,
  getValues,
  isProd,
  log,
  checkAndMergePayouts,
  revalidateStaticProps,
} from 'shared/utils'
import { getLoanPayouts, getPayouts, groupPayoutsByUser } from 'common/payouts'
import { isAdmin, isManifoldId } from 'common/envs/constants'
import { removeUndefinedProps } from 'common/util/object'
import { LiquidityProvision } from 'common/liquidity-provision'
import { APIError, newEndpoint, validate } from './api'
import { getContractBetMetrics } from 'common/calculate'
import { createContractResolvedNotifications } from './create-notification'
import { CancelUniqueBettorBonusTxn, Txn } from 'common/txn'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { User } from 'common/user'
import { updateContractMetricsForUsers } from './helpers/user-contract-metrics'
import { computeContractMetricUpdates } from './update-contract-metrics'
import { runTxn, TxnData } from './run-txn'

import { ContractResolutionPayoutTxn } from 'common/txn'
import { runContractPayoutTxn } from './run-txn'

export const payUsersTransactions = async (
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[],
  contractId: string
) => {
  const firestore = admin.firestore()
  const mergedPayouts = checkAndMergePayouts(payouts)
  const payoutChunks = chunk(mergedPayouts, 500)

  for (const payoutChunk of payoutChunks) {
    await firestore.runTransaction(async (transaction) => {
      payoutChunk.forEach(({ userId, payout, deposit }) => {
        const payoutTxn: Omit<
          ContractResolutionPayoutTxn,
          'id' | 'createdTime'
        > = {
          category: 'CONTRACT_RESOLUTION_PAYOUT',
          fromType: 'CONTRACT',
          fromId: contractId,
          toType: 'USER',
          toId: userId,
          amount: payout,
          token: 'M$',
          description: 'Contract payout for resolution: ' + contractId,
        } as ContractResolutionPayoutTxn
        runContractPayoutTxn(transaction, payoutTxn, deposit ?? 0)
      })
    })
  }
}

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

const opts = { secrets: ['MAILGUN_KEY', 'API_SECRET'] }

export const resolvemarket = newEndpoint(opts, async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists)
    throw new APIError(404, 'No contract exists with the provided ID')
  const contract = contractSnap.data() as Contract
  const { creatorId } = contract
  const firebaseUser = await admin.auth().getUser(auth.uid)

  const resolutionParams = getResolutionParams(contract, req.body)

  if (
    creatorId !== auth.uid &&
    !isManifoldId(auth.uid) &&
    !isAdmin(firebaseUser.email)
  )
    throw new APIError(403, 'User is not creator of contract')

  if (contract.resolution) throw new APIError(400, 'Contract already resolved')

  const creator = await getUser(creatorId)
  if (!creator) throw new APIError(500, 'Creator not found')

  return await resolveMarket(contract, creator, resolutionParams)
})

export const resolveMarket = async (
  unresolvedContract: Contract,
  creator: User,
  { value, resolutions, probabilityInt, outcome }: ResolutionParams
) => {
  const { creatorId, closeTime, id: contractId } = unresolvedContract

  const resolutionProbability =
    probabilityInt !== undefined ? probabilityInt / 100 : undefined

  const resolutionProbs = resolutions
    ? (() => {
        const total = sum(Object.values(resolutions))
        return mapValues(resolutions, (p) => p / total)
      })()
    : undefined

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

  const {
    payouts: traderPayouts,
    creatorPayout,
    liquidityPayouts,
    collectedFees,
  } = getPayouts(
    outcome,
    unresolvedContract,
    bets,
    liquidities,
    resolutionProbs,
    resolutionProbability
  )

  let contract = {
    ...unresolvedContract,
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
    subsidyPool: 0,
  } as Contract

  const updates = await computeContractMetricUpdates(contract, Date.now())
  contract = { ...contract, ...(updates as any) }

  const openBets = bets.filter((b) => !b.isSold && !b.sale)
  const loanPayouts = getLoanPayouts(openBets)

  const payoutsWithoutLoans = [
    { userId: creatorId, payout: creatorPayout, deposit: creatorPayout },
    ...liquidityPayouts.map((p) => ({ ...p, deposit: p.payout })),
    ...traderPayouts,
  ]
  const payouts = [...payoutsWithoutLoans, ...loanPayouts]

  if (!isProd())
    console.log(
      'trader payouts:',
      traderPayouts,
      'creator payout:',
      creatorPayout,
      'liquidity payout:',
      liquidityPayouts,
      'loan payouts:',
      loanPayouts
    )

  // Should we combine all the payouts into one txn?
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  await payUsersTransactions(payouts, contractId)
  await contractDoc.update(contract)

  console.log('contract ', contractId, 'resolved to:', outcome)

  await updateContractMetricsForUsers(contract, bets)
  await undoUniqueBettorRewardsIfCancelResolution(contract, outcome)
  await revalidateStaticProps(getContractPath(contract))

  const userPayoutsWithoutLoans = groupPayoutsByUser(payoutsWithoutLoans)

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

  return contract
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

type ResolutionParams = ReturnType<typeof getResolutionParams>

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
