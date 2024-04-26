import * as admin from 'firebase-admin'
import { mapValues, groupBy, sum, sumBy, chunk } from 'lodash'

import {
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { Bet } from 'common/bet'
import { getContractBetMetrics } from 'common/calculate'
import { Contract, contractPath, CPMMMultiContract } from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { Txn, CancelUniqueBettorBonusTxn } from 'common/txn'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { createContractResolvedNotifications } from './create-notification'
import { updateContractMetricsForUsers } from './helpers/user-contract-metrics'
import { TxnData, insertTxns, runTxn } from './txn/run-txn'
import {
  revalidateStaticProps,
  isProd,
  checkAndMergePayouts,
  log,
} from './utils'
import { getLoanPayouts, getPayouts, groupPayoutsByUser } from 'common/payouts'
import { APIError } from 'common//api/utils'
import { FieldValue, Query } from 'firebase-admin/firestore'
import { trackPublicEvent } from 'shared/analytics'
import { recordContractEdit } from 'shared/record-contract-edit'
import { createSupabaseDirectClient } from './supabase/init'
import { Answer } from 'common/answer'
import { acquireLock, releaseLock } from './firestore-lock'
import { ENV_CONFIG, SPICE_PRODUCTION_ENABLED } from 'common/envs/constants'
import { convertTxn } from 'common/supabase/txns'

export type ResolutionParams = {
  outcome: string
  probabilityInt?: number
  answerId?: string
  value?: number
  resolutions?: { [key: string]: number }
}

export const resolveMarketHelper = async (
  unresolvedContract: Contract,
  resolver: User,
  creator: User,
  { value, resolutions, probabilityInt, outcome, answerId }: ResolutionParams
) => {
  let lockId = unresolvedContract.id
  if (
    unresolvedContract.outcomeType === 'MULTIPLE_CHOICE' &&
    unresolvedContract.mechanism === 'cpmm-multi-1' &&
    !unresolvedContract.shouldAnswersSumToOne
  ) {
    // Allow multiple independent multi answers to resolve at the same time.
    lockId = `${unresolvedContract.id}-${answerId}`
  }
  const didAcquire = await acquireLock(lockId)
  if (!didAcquire) {
    throw new APIError(
      403,
      'Contract is already being resolved (failed to acquire lock)'
    )
  }

  try {
    const { closeTime, id: contractId, outcomeType } = unresolvedContract

    const resolutionTime = Date.now()
    const newCloseTime = closeTime
      ? Math.min(closeTime, resolutionTime)
      : closeTime

    const { bets, resolutionProbability, payouts, payoutsWithoutLoans } =
      await getDataAndPayoutInfo(
        outcome,
        unresolvedContract,
        resolutions,
        probabilityInt,
        answerId
      )

    let updatedContractAttrs: Partial<Contract> | undefined =
      removeUndefinedProps({
        isResolved: true,
        resolution: outcome,
        resolutionValue: value,
        resolutionTime,
        closeTime: newCloseTime,
        resolutionProbability,
        resolutions,
        resolverId: resolver.id,
        subsidyPool: 0,
        lastUpdatedTime: newCloseTime,
      })
    let updateAnswerAttrs: Partial<Answer> | undefined

    if (unresolvedContract.mechanism === 'cpmm-multi-1' && answerId) {
      // Only resolve the contract if all other answers are resolved.
      const allAnswersResolved = unresolvedContract.answers
        .filter((a) => a.id !== answerId)
        .every((a) => a.resolution)

      const hasAnswerResolvedYes =
        unresolvedContract.answers.some((a) => a.resolution === 'YES') ||
        outcome === 'YES'
      const marketCancelled = unresolvedContract.answers.every(
        (a) => a.resolution === 'CANCEL'
      )
      const finalResolution = marketCancelled ? 'CANCEL' : 'MKT'
      if (
        allAnswersResolved &&
        outcomeType !== 'NUMBER' &&
        // If the contract has special liquidity per answer, only resolve if an answer is resolved YES.
        (!unresolvedContract.specialLiquidityPerAnswer || hasAnswerResolvedYes)
      )
        updatedContractAttrs = {
          ...updatedContractAttrs,
          resolution: finalResolution,
        }
      else updatedContractAttrs = undefined

      const finalProb =
        resolutionProbability ??
        (outcome === 'YES' ? 1 : outcome === 'NO' ? 0 : undefined)
      updateAnswerAttrs = removeUndefinedProps({
        resolution: outcome,
        resolutionTime,
        resolutionProbability,
        prob: finalProb,
        resolverId: resolver.id,
      }) as Partial<Answer>
      // We have to update the denormalized answer data on the contract for the updateContractMetrics call
      updatedContractAttrs = {
        ...(updatedContractAttrs ?? {}),
        answers: unresolvedContract.answers.map((a) =>
          a.id === answerId
            ? {
                ...a,
                ...updateAnswerAttrs,
              }
            : a
        ),
      } as Partial<CPMMMultiContract>
    }

    const contract = {
      ...unresolvedContract,
      ...updatedContractAttrs,
    } as Contract

    // handle exploit where users can get negative payouts
    const negPayoutThreshold = contract.uniqueBettorCount < 100 ? 0 : -1000

    const userPayouts = groupPayoutsByUser(payouts)
    log('user payouts', { userPayouts })

    const negativePayouts = Object.values(userPayouts).filter(
      (p) => p < negPayoutThreshold
    )

    log('negative payouts', { negativePayouts })

    if (
      outcome === 'CANCEL' &&
      !ENV_CONFIG.adminIds.includes(resolver.id) &&
      negativePayouts.length > 0
    ) {
      throw new APIError(
        403,
        'Negative payouts too large for resolution. Contact admin.'
      )
    }

    const contractDoc = firestore.doc(`contracts/${contractId}`)

    if (updatedContractAttrs) {
      log('updating contract', { updatedContractAttrs })
      await contractDoc.update(updatedContractAttrs)
      log('contract resolved')
    }
    if (updateAnswerAttrs) {
      const answerDoc = firestore.doc(
        `contracts/${contractId}/answersCpmm/${answerId}`
      )
      await answerDoc.update(removeUndefinedProps(updateAnswerAttrs))
    }
    log('processing payouts', { payouts })
    await payUsersTransactions(
      payouts,
      contractId,
      answerId,
      contract.isRanked != false
    )

    await updateContractMetricsForUsers(contract, bets)
    // TODO: we may want to support clawing back trader bonuses on MC markets too
    if (!answerId) {
      await undoUniqueBettorRewardsIfCancelResolution(contract, outcome)
    }
    await revalidateStaticProps(contractPath(contract))

    const userPayoutsWithoutLoans = groupPayoutsByUser(payoutsWithoutLoans)

    const userIdToContractMetrics = mapValues(
      groupBy(bets, (bet) => bet.userId),
      (bets) => getContractBetMetrics(contract, bets)
    )
    await trackPublicEvent(resolver.id, 'resolve market', {
      resolution: outcome,
      contractId,
    })

    await recordContractEdit(
      unresolvedContract,
      resolver.id,
      Object.keys(updatedContractAttrs ?? {})
    )

    await createContractResolvedNotifications(
      contract,
      resolver,
      creator,
      outcome,
      probabilityInt,
      value,
      answerId,
      {
        userIdToContractMetrics,
        userPayouts: userPayoutsWithoutLoans,
        creatorPayout: 0,
        resolutionProbability,
        resolutions,
      }
    )

    return contract
  } finally {
    await releaseLock(lockId)
  }
}

export const getDataAndPayoutInfo = async (
  outcome: string | undefined,
  unresolvedContract: Contract,
  resolutions: { [key: string]: number } | undefined,
  probabilityInt: number | undefined,
  answerId: string | undefined
) => {
  const { id: contractId, outcomeType } = unresolvedContract
  const liquiditiesSnap = await firestore
    .collection(`contracts/${contractId}/liquidity`)
    .get()

  const liquidityDocs = liquiditiesSnap.docs.map(
    (doc) => doc.data() as LiquidityProvision
  )

  const liquidities =
    unresolvedContract.mechanism === 'cpmm-multi-1' &&
    outcomeType !== 'NUMBER' &&
    unresolvedContract.specialLiquidityPerAnswer
      ? // Filter out initial liquidity if set up with special liquidity per answer.
        liquidityDocs.filter((l) => !l.isAnte)
      : liquidityDocs

  let bets: Bet[]
  if (
    unresolvedContract.mechanism === 'cpmm-multi-1' &&
    unresolvedContract.shouldAnswersSumToOne
  ) {
    // Load bets from supabase as an optimization.
    // This type of multi choice generates a lot of extra bets that have shares = 0.
    const pg = createSupabaseDirectClient()
    bets = await pg.map(
      `select * from contract_bets
      where contract_id = $1
      and (shares != 0 or (data->>'loanAmount')::numeric != 0)
      `,
      [contractId],
      (row) => row.data
    )
  } else {
    let betsQuery: Query<any> = firestore.collection(
      `contracts/${contractId}/bets`
    )
    if (answerId) {
      betsQuery = betsQuery.where('answerId', '==', answerId)
    }
    const betsSnap = await betsQuery.get()
    bets = betsSnap.docs.map((doc) => doc.data() as Bet)
  }

  const resolutionProbability =
    probabilityInt !== undefined ? probabilityInt / 100 : undefined

  const resolutionProbs = resolutions
    ? (() => {
        const total = sum(Object.values(resolutions))
        return mapValues(resolutions, (p) => p / total)
      })()
    : undefined
  const openBets = bets.filter((b) => !b.isSold && !b.sale)
  const loanPayouts = getLoanPayouts(openBets)

  const { payouts: traderPayouts, liquidityPayouts } = getPayouts(
    outcome,
    unresolvedContract,
    bets,
    liquidities,
    resolutionProbs,
    resolutionProbability,
    answerId
  )
  const payoutsWithoutLoans = [
    ...liquidityPayouts.map((p) => ({ ...p, deposit: p.payout })),
    ...traderPayouts,
  ]
  if (!isProd())
    console.log(
      'trader payouts:',
      traderPayouts,
      'liquidity payout:',
      liquidityPayouts,
      'loan payouts:',
      loanPayouts
    )
  const payouts = [...payoutsWithoutLoans, ...loanPayouts]
  return {
    payoutsWithoutLoans,
    bets,
    resolutionProbs,
    resolutionProbability,
    payouts,
  }
}
async function undoUniqueBettorRewardsIfCancelResolution(
  contract: Contract,
  outcome: string
) {
  const pg = createSupabaseDirectClient()

  if (outcome === 'CANCEL') {
    const bonusTxnsOnThisContract = await pg.map<Txn>(
      `select * from txns where category = 'UNIQUE_BETTOR_BONUS'
      and to_id = $1
      and data->data->>'contractId' = $2`,
      [contract.creatorId, contract.id],
      (row) => convertTxn(row)
    )

    log('total bonusTxnsOnThisContract ' + bonusTxnsOnThisContract.length)
    const totalBonusAmount = sumBy(bonusTxnsOnThisContract, (txn) => txn.amount)
    log('totalBonusAmount to be withdrawn ' + totalBonusAmount)

    const bonusTxn = {
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

    try {
      const txn = await pg.tx((tx) => runTxn(tx, bonusTxn))
      log(
        `Cancel Bonus txn for user: ${contract.creatorId} completed: ${txn.id}`
      )
    } catch (e) {
      log.error(
        `Couldn't cancel bonus for user: ${contract.creatorId} - status: failure`
      )
      if (e instanceof APIError) {
        log.error(e.message)
      }
    }
  }
}

export const payUsersTransactions = async (
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[],
  contractId: string,
  answerId: string | undefined,
  isRanked: boolean
) => {
  const pg = createSupabaseDirectClient()
  const firestore = admin.firestore()
  const mergedPayouts = checkAndMergePayouts(payouts)
  const payoutChunks = chunk(mergedPayouts, 250)
  const payoutStartTime = Date.now()

  for (const payoutChunk of payoutChunks) {
    const txns: TxnData[] = []
    let error = false
    await firestore
      .runTransaction(async (transaction) => {
        payoutChunk.forEach(({ userId, payout, deposit }) => {
          if (SPICE_PRODUCTION_ENABLED && isRanked) {
            const toDoc = firestore.doc(`users/${userId}`)
            transaction.update(toDoc, {
              spiceBalance: FieldValue.increment(payout),
              totalDeposits: FieldValue.increment(deposit ?? 0),
            })

            txns.push({
              category: 'PRODUCE_SPICE',
              fromType: 'CONTRACT',
              fromId: contractId,
              toType: 'USER',
              toId: userId,
              amount: payout,
              token: 'SPICE',
              data: removeUndefinedProps({
                deposit: deposit ?? 0,
                payoutStartTime,
                answerId,
              }),
              description: 'Contract payout for resolution',
            })
          } else {
            const toDoc = firestore.doc(`users/${userId}`)
            transaction.update(toDoc, {
              balance: FieldValue.increment(payout),
              totalDeposits: FieldValue.increment(deposit ?? 0),
            })

            txns.push({
              category: 'CONTRACT_RESOLUTION_PAYOUT',
              fromType: 'CONTRACT',
              fromId: contractId,
              toType: 'USER',
              toId: userId,
              amount: payout,
              token: 'M$',
              data: removeUndefinedProps({
                deposit: deposit ?? 0,
                payoutStartTime,
                answerId,
              }),
              description: 'Contract payout for resolution: ' + contractId,
            })
          }
        })
      })
      .catch(() => {
        // don't rethrow error without undoing previous payouts
        log('Error running payout chunk transaction', { error, payoutChunk })
        error = true
      })

    if (!error) {
      await pg.tx((tx) => insertTxns(tx, txns))
    }
  }
}

const firestore = admin.firestore()
