import { mapValues, groupBy, sum, sumBy } from 'lodash'
import {
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { Bet } from 'common/bet'
import { getContractBetMetrics } from 'common/calculate'
import {
  Contract,
  contractPath,
  CPMMMultiContract,
  MarketContract,
} from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { Txn, CancelUniqueBettorBonusTxn } from 'common/txn'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { createContractResolvedNotifications } from './create-notification'
import { updateContractMetricsForUsers } from './helpers/user-contract-metrics'
import {
  TxnData,
  runTxnInBetQueueIgnoringBalance,
  txnToRow,
} from './txn/run-txn'
import {
  revalidateStaticProps,
  isProd,
  log,
  getContractAndBetsAndLiquidities,
} from './utils'
import { getLoanPayouts, getPayouts, groupPayoutsByUser } from 'common/payouts'
import { APIError } from 'common//api/utils'
import { trackPublicEvent } from 'shared/analytics'
import { recordContractEdit } from 'shared/record-contract-edit'
import {
  SupabaseTransaction,
  createSupabaseDirectClient,
} from './supabase/init'
import { Answer } from 'common/answer'
import { isAdminId, isModId } from 'common/envs/constants'
import { convertTxn } from 'common/supabase/txns'
import { updateAnswer, updateAnswers } from './supabase/answers'
import { bulkInsertQuery, updateDataQuery } from './supabase/utils'
import { bulkIncrementBalancesQuery } from './supabase/users'
import { broadcastUpdatedContract } from './websockets/helpers'

export type ResolutionParams = {
  outcome: string
  probabilityInt?: number
  answerId?: string
  value?: number
  resolutions?: { [key: string]: number }
}

export const resolveMarketHelper = async (
  unresolvedContract: MarketContract,
  resolver: User,
  creator: User,
  { value, resolutions, probabilityInt, outcome, answerId }: ResolutionParams
) => {
  const pg = createSupabaseDirectClient()

  const { contract, bets, payoutsWithoutLoans, updatedContractAttrs } =
    await pg.tx(async (tx) => {
      const { closeTime, id: contractId, outcomeType } = unresolvedContract
      const {
        contract: c,
        bets,
        liquidities,
      } = await getContractAndBetsAndLiquidities(
        tx,
        unresolvedContract,
        answerId
      )
      if (!c) {
        throw new APIError(500, 'Contract not found')
      }
      unresolvedContract = c as MarketContract
      if (unresolvedContract.isResolved) {
        throw new APIError(403, 'Contract is already resolved')
      }

      const resolutionTime = Date.now()
      const newCloseTime = closeTime
        ? Math.min(closeTime, resolutionTime)
        : closeTime

      // ian: TODO: just use contract metrics for this (but after the election)
      const { resolutionProbability, payouts, payoutsWithoutLoans } =
        getPayoutInfo(
          outcome,
          unresolvedContract,
          resolutions,
          probabilityInt,
          answerId,
          bets,
          liquidities
        )
      // Keep MKT resolution prob for consistency's sake
      const probBeforeResolution =
        outcome === 'MKT'
          ? resolutionProbability
          : unresolvedContract.mechanism === 'cpmm-1'
          ? unresolvedContract.prob
          : unresolvedContract.answers.find((a) => a.id === answerId)?.prob
      const newProb =
        outcome === 'YES' ? 1 : outcome === 'NO' ? 0 : probBeforeResolution
      let updatedContractAttrs: Partial<Contract> & { id: string } =
        removeUndefinedProps({
          id: unresolvedContract.id,
          isResolved: true,
          resolution: outcome,
          resolutionValue: value,
          resolutionTime,
          closeTime: newCloseTime,
          prob: newProb,
          resolutionProbability: probBeforeResolution,
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
          (!unresolvedContract.specialLiquidityPerAnswer ||
            hasAnswerResolvedYes)
        ) {
          updatedContractAttrs = {
            ...updatedContractAttrs,
            resolution: finalResolution,
          }
        } else {
          updatedContractAttrs = {
            id: unresolvedContract.id,
          }
        }
        updateAnswerAttrs = removeUndefinedProps({
          resolution: outcome,
          resolutionTime,
          resolutionProbability: probBeforeResolution,
          prob: newProb,
          resolverId: resolver.id,
        }) as Partial<Answer>
        // We have to update the denormalized answer data on the contract for the updateContractMetrics call
        updatedContractAttrs = {
          ...updatedContractAttrs,
          answers: unresolvedContract.answers.map((a) =>
            a.id === answerId
              ? {
                  ...a,
                  ...updateAnswerAttrs,
                }
              : a
          ),
        } as Partial<CPMMMultiContract> & { id: string }
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
          ...updatedContractAttrs,
          answers: unresolvedContract.answers.map((a) => ({
            ...a,
            ...updateAnswerAttrs,
            prob: resolutions ? (resolutions[a.id] ?? 0) / 100 : undefined,
            resolutionProbability: a.prob,
          })),
        } as Partial<CPMMMultiContract> & { id: string }
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

      if (updateAnswerAttrs && answerId) {
        const props = removeUndefinedProps(updateAnswerAttrs)
        await updateAnswer(tx, answerId, props)
      } else if (updateAnswerAttrs && contract.mechanism === 'cpmm-multi-1') {
        const answerUpdates = contract.answers.map((a) =>
          removeUndefinedProps({
            id: a.id,
            ...updateAnswerAttrs,
            prob: a.prob,
            resolutionProbability: a.resolutionProbability,
          })
        )
        await updateAnswers(tx, contractId, answerUpdates)
      }
      log('processing payouts', { payouts })
      const { balanceUpdatesQuery, insertTxnsQuery } = getPayUsersQueries(
        payouts,
        contractId,
        answerId,
        {
          payoutCash: contract.token === 'CASH',
        }
      )

      log('updating contract', { updatedContractAttrs })
      const contractUpdateQuery = updateDataQuery(
        'contracts',
        'id',
        updatedContractAttrs
      )

      await tx.multi(`
      ${balanceUpdatesQuery};
      ${insertTxnsQuery};
      ${contractUpdateQuery};
      `)

      // TODO: we may want to support clawing back trader bonuses on MC markets too
      if (!answerId && outcome === 'CANCEL') {
        await undoUniqueBettorRewardsIfCancelResolution(tx, contract)
      }
      return { contract, bets, payoutsWithoutLoans, updatedContractAttrs }
    })

  broadcastUpdatedContract(contract.visibility, updatedContractAttrs)
  const userPayoutsWithoutLoans = groupPayoutsByUser(payoutsWithoutLoans)

  const userIdToContractMetrics = mapValues(
    groupBy(bets, (bet) => bet.userId),
    (bets) => getContractBetMetrics(contract, bets)
  )
  await trackPublicEvent(resolver.id, 'resolve market', {
    resolution: outcome,
    contractId: contract.id,
  })

  await recordContractEdit(
    unresolvedContract,
    resolver.id,
    Object.keys(updatedContractAttrs ?? {})
  )

  await updateContractMetricsForUsers(contract, bets)
  await revalidateStaticProps(contractPath(contract))

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
      resolutionProbability: contract.resolutionProbability,
      resolutions,
    }
  )

  return contract
}

export const getPayoutInfo = (
  outcome: string | undefined,
  unresolvedContract: Contract,
  resolutions: { [key: string]: number } | undefined,
  probabilityInt: number | undefined,
  answerId: string | undefined,
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
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
  const payouts = [...payoutsWithoutLoans, ...loanPayouts].filter(
    (p) => p.payout !== 0
  )
  return {
    payoutsWithoutLoans,
    bets,
    resolutionProbs,
    resolutionProbability,
    payouts,
  }
}

async function undoUniqueBettorRewardsIfCancelResolution(
  pg: SupabaseTransaction,
  contract: Contract
) {
  const bonusTxnsOnThisContract = await pg.map<Txn>(
    `select * from txns where category = 'UNIQUE_BETTOR_BONUS'
      and to_id = $1
      and data->'data'->>'contractId' = $2`,
    [contract.creatorId, contract.id],
    convertTxn
  )

  log('total bonusTxnsOnThisContract ' + bonusTxnsOnThisContract.length)
  const totalBonusAmount = sumBy(bonusTxnsOnThisContract, (txn) => txn.amount)
  log('totalBonusAmount to be withdrawn ' + totalBonusAmount)

  if (totalBonusAmount === 0) {
    log('No bonus to cancel')
    return
  }

  const undoBonusTxn = {
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

  const txn = await runTxnInBetQueueIgnoringBalance(pg, undoBonusTxn)
  log(`Cancel Bonus txn for user: ${contract.creatorId} completed: ${txn.id}`)
}

export const getPayUsersQueries = (
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[],
  contractId: string,
  answerId: string | undefined,
  options?: {
    payoutCash: boolean
  }
) => {
  const { payoutCash } = options ?? {}
  const mergedPayouts = checkAndMergePayouts(payouts)
  const payoutStartTime = Date.now()

  const balanceUpdates: {
    id: string
    balance?: number
    spiceBalance?: number
    totalDeposits: number
  }[] = []
  const txns: TxnData[] = []

  for (const { userId, payout, deposit } of mergedPayouts) {
    balanceUpdates.push({
      id: userId,
      [payoutCash ? 'cashBalance' : 'balance']: payout,
      totalDeposits: deposit ?? 0,
    })

    txns.push({
      category: 'CONTRACT_RESOLUTION_PAYOUT',
      fromType: 'CONTRACT',
      fromId: contractId,
      toType: 'USER',
      toId: userId,
      amount: payout,
      token: payoutCash ? 'CASH' : 'M$',
      data: removeUndefinedProps({
        deposit: deposit ?? 0,
        payoutStartTime,
        answerId,
      }),
      description: 'Contract payout for resolution: ' + contractId,
    })
  }

  const balanceUpdatesQuery = bulkIncrementBalancesQuery(balanceUpdates)
  const insertTxnsQuery = bulkInsertQuery('txns', txns.map(txnToRow), false)

  return { balanceUpdatesQuery, insertTxnsQuery }
}

const checkAndMergePayouts = (
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[]
) => {
  for (const { payout, deposit } of payouts) {
    if (!isFinite(payout)) {
      throw new Error('Payout is not finite: ' + payout)
    }
    if (deposit !== undefined && !isFinite(deposit)) {
      throw new Error('Deposit is not finite: ' + deposit)
    }
  }

  const groupedPayouts = groupBy(payouts, 'userId')
  return Object.values(
    mapValues(groupedPayouts, (payouts, userId) => ({
      userId,
      payout: sumBy(payouts, 'payout'),
      deposit: sumBy(payouts, (p) => p.deposit ?? 0),
    }))
  ).filter((p) => p!.payout !== 0 || p!.deposit !== 0)
}
