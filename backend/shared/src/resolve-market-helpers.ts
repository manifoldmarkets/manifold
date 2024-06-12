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
import { trackPublicEvent } from 'shared/analytics'
import { recordContractEdit } from 'shared/record-contract-edit'
import { createSupabaseDirectClient } from './supabase/init'
import { Answer } from 'common/answer'
import {
  SPICE_PRODUCTION_ENABLED,
  isAdminId,
  isModId,
} from 'common/envs/constants'
import { convertTxn } from 'common/supabase/txns'
import { bulkIncrementBalances } from './supabase/users'
import { convertBet } from 'common/supabase/bets'
import { convertLiquidity } from 'common/supabase/liquidity'
import { broadcastUpdatedAnswer } from './websockets/helpers'
import { updateAnswer } from './supabase/answers'
import { updateContract } from './supabase/contracts'

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
  const pg = createSupabaseDirectClient()

  // Fetch fresh contract & check if resolved within lock.
  const contractSnap = await firestore
    .collection('contracts')
    .doc(unresolvedContract.id)
    .get()
  unresolvedContract = contractSnap.data() as Contract

  if (unresolvedContract.isResolved) {
    throw new APIError(403, 'Contract is already resolved')
  }

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
  } else if (
    unresolvedContract.mechanism === 'cpmm-multi-1' &&
    updatedContractAttrs.isResolved
  ) {
    updateAnswerAttrs = removeUndefinedProps({
      resolutionTime,
      resolverId: resolver.id,
    }) as Partial<Answer>
    // We have to update the denormalized answer data on the contract for the updateContractMetrics call
    updatedContractAttrs = {
      ...(updatedContractAttrs ?? {}),
      answers: unresolvedContract.answers.map((a) => ({
        ...a,
        ...updateAnswerAttrs,
      })),
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
    !isAdminId(resolver.id) &&
    !isModId(resolver.id) &&
    negativePayouts.length > 0
  ) {
    throw new APIError(
      403,
      'Negative payouts too large for resolution. Contact admin or mod.'
    )
  }

  if (updatedContractAttrs) {
    log('updating contract', { updatedContractAttrs })
    await updateContract(pg, contractId, updatedContractAttrs)
    log('contract resolved')
  }
  if (updateAnswerAttrs && answerId) {
    const props = removeUndefinedProps(updateAnswerAttrs)
    const updated = await updateAnswer(pg, answerId, props)
    broadcastUpdatedAnswer(contract, updated)
  } else if (
    updateAnswerAttrs &&
    unresolvedContract.mechanism === 'cpmm-multi-1'
  ) {
    for (const answer of unresolvedContract.answers) {
      const props = removeUndefinedProps(updateAnswerAttrs)
      const updated = await updateAnswer(pg, answer.id, props)
      broadcastUpdatedAnswer(contract, updated)
    }
  }
  log('processing payouts', { payouts })
  await payUsersTransactions(
    payouts,
    contractId,
    answerId,
    !!contract.isSpicePayout
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
}

export const getDataAndPayoutInfo = async (
  outcome: string | undefined,
  unresolvedContract: Contract,
  resolutions: { [key: string]: number } | undefined,
  probabilityInt: number | undefined,
  answerId: string | undefined
) => {
  const { id: contractId, outcomeType } = unresolvedContract

  const pg = createSupabaseDirectClient()

  // Filter out initial liquidity if set up with special liquidity per answer.
  const filterAnte =
    unresolvedContract.mechanism === 'cpmm-multi-1' &&
    outcomeType !== 'NUMBER' &&
    unresolvedContract.specialLiquidityPerAnswer

  const liquidities = await pg.map<LiquidityProvision>(
    `select * from contract_liquidity where contract_id = $1 ${
      filterAnte ? 'and answer_id = $2' : ''
    }`,
    [contractId, answerId],
    convertLiquidity
  )

  let bets: Bet[]
  if (
    unresolvedContract.mechanism === 'cpmm-multi-1' &&
    unresolvedContract.shouldAnswersSumToOne
  ) {
    // Load bets from supabase as an optimization.
    // This type of multi choice generates a lot of extra bets that have shares = 0.
    bets = await pg.map(
      `select * from contract_bets
      where contract_id = $1
      and (shares != 0 or (data->>'loanAmount')::numeric != 0)
      `,
      [contractId],
      convertBet
    )
  } else {
    bets = await pg.map(
      `select * from contract_bets
      where contract_id = $1
      ${answerId ? `and data->>'answerId' = $2` : ''}`,
      [contractId, answerId],
      convertBet
    )
  }

  const resolutionProbability =
    probabilityInt !== undefined ? probabilityInt / 100 : undefined

  const resolutionProbs = resolutions
    ? (() => {
        const total = sum(Object.values(resolutions))
        return mapValues(resolutions, (p) => p / total)
      })()
    : undefined
  const loanPayouts = getLoanPayouts(bets)

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
      and data->'data'->>'contractId' = $2`,
      [contract.creatorId, contract.id],
      (row) => convertTxn(row)
    )

    log('total bonusTxnsOnThisContract ' + bonusTxnsOnThisContract.length)
    const totalBonusAmount = sumBy(bonusTxnsOnThisContract, (txn) => txn.amount)
    log('totalBonusAmount to be withdrawn ' + totalBonusAmount)

    if (totalBonusAmount === 0) {
      log('No bonus to cancel')
      return
    }

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
  payoutSpice: boolean
) => {
  const pg = createSupabaseDirectClient()
  const mergedPayouts = checkAndMergePayouts(payouts)
  const payoutChunks = chunk(mergedPayouts, 250)
  const payoutStartTime = Date.now()

  for (const payoutChunk of payoutChunks) {
    const balanceUpdates: {
      id: string
      balance?: number
      spiceBalance?: number
      totalDeposits: number
    }[] = []
    const txns: TxnData[] = []

    payoutChunk.forEach(async ({ userId, payout, deposit }) => {
      if (SPICE_PRODUCTION_ENABLED && payoutSpice) {
        balanceUpdates.push({
          id: userId,
          spiceBalance: payout,
          totalDeposits: deposit ?? 0,
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
        balanceUpdates.push({
          id: userId,
          balance: payout,
          totalDeposits: deposit ?? 0,
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

    await pg
      .tx(async (tx) => {
        await bulkIncrementBalances(tx, balanceUpdates)
        await insertTxns(tx, txns)
      })
      .catch((e) => {
        // don't rethrow error without undoing previous payouts
        log.error(e)
        log.error('Error running payout chunk transaction', { payoutChunk })
      })
  }
}

const firestore = admin.firestore()
