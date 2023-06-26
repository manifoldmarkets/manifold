import * as admin from 'firebase-admin'
import { mapValues, groupBy, sum, sumBy, chunk } from 'lodash'

import {
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { Bet } from 'common/bet'
import { getContractBetMetrics } from 'common/calculate'
import { Contract, contractPath } from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import {
  Txn,
  CancelUniqueBettorBonusTxn,
  ContractResolutionPayoutTxn,
} from 'common/txn'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { createContractResolvedNotifications } from './create-notification'
import { updateContractMetricsForUsers } from './helpers/user-contract-metrics'
import { TxnData, runTxn, runContractPayoutTxn } from './run-txn'
import {
  revalidateStaticProps,
  isProd,
  getValues,
  log,
  checkAndMergePayouts,
} from './utils'
import { getLoanPayouts, getPayouts, groupPayoutsByUser } from 'common/payouts'
import { APIError } from 'common/api'

export type ResolutionParams = {
  outcome: string
  probabilityInt?: number
  value?: number
  resolutions?: { [key: string]: number }
}

export const resolveMarketHelper = async (
  unresolvedContract: Contract,
  resolver: User,
  creator: User,
  { value, resolutions, probabilityInt, outcome }: ResolutionParams
) => {
  const { closeTime, id: contractId } = unresolvedContract

  const resolutionTime = Date.now()
  const newCloseTime = closeTime
    ? Math.min(closeTime, resolutionTime)
    : closeTime

  const {
    creatorPayout,
    collectedFees,
    bets,
    resolutionProbability,
    payouts,
    payoutsWithoutLoans,
  } = await getDataAndPayoutInfo(
    outcome,
    unresolvedContract,
    resolutions,
    probabilityInt
  )

  const contract = {
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

  // mqp: it would be nice to do this but would require some refactoring
  // const updates = await computeContractMetricUpdates(contract, Date.now())
  // contract = { ...contract, ...(updates as any) }

  // Should we combine all the payouts into one txn?
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  await payUsersTransactions(payouts, contractId)
  await contractDoc.update(contract)

  console.log('contract ', contractId, 'resolved to:', outcome)

  await updateContractMetricsForUsers(contract, bets)
  await undoUniqueBettorRewardsIfCancelResolution(contract, outcome)
  await revalidateStaticProps(contractPath(contract))

  const userPayoutsWithoutLoans = groupPayoutsByUser(payoutsWithoutLoans)

  // handle exploit where users can get negative payouts
  const negPayoutThreshold =
    Date.now() - contract.createdTime < 96 * 60 * 60 * 1000 ||
    contract.uniqueBettorCount < 10
      ? -10
      : -250

  const negativePayouts = Object.values(userPayoutsWithoutLoans).filter(
    (p) => p <= negPayoutThreshold
  )

  if (negativePayouts.length > 0) {
    throw new APIError(403, 'Negative payouts too large for resolution')
  }

  const userIdToContractMetrics = mapValues(
    groupBy(bets, (bet) => bet.userId),
    (bets) => getContractBetMetrics(contract, bets)
  )

  await createContractResolvedNotifications(
    contract,
    resolver,
    creator,
    outcome,
    probabilityInt,
    value,
    {
      userIdToContractMetrics,
      userPayouts: userPayoutsWithoutLoans,
      creatorPayout,
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
  probabilityInt: number | undefined
) => {
  const { id: contractId, creatorId } = unresolvedContract
  const liquiditiesSnap = await firestore
    .collection(`contracts/${contractId}/liquidity`)
    .get()

  const liquidities = liquiditiesSnap.docs.map(
    (doc) => doc.data() as LiquidityProvision
  )

  const betsSnap = await firestore
    .collection(`contracts/${contractId}/bets`)
    .get()

  const bets = betsSnap.docs.map((doc) => doc.data() as Bet)

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
  const payoutsWithoutLoans = [
    { userId: creatorId, payout: creatorPayout, deposit: creatorPayout },
    ...liquidityPayouts.map((p) => ({ ...p, deposit: p.payout })),
    ...traderPayouts,
  ]
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
  const payouts = [...payoutsWithoutLoans, ...loanPayouts]
  return {
    payoutsWithoutLoans,
    creatorPayout,
    collectedFees,
    bets,
    resolutionProbability,
    payouts,
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
  const payoutChunks = chunk(mergedPayouts, 250)

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
          data: { deposit: deposit ?? 0 },
          description: 'Contract payout for resolution: ' + contractId,
        } as ContractResolutionPayoutTxn
        runContractPayoutTxn(transaction, payoutTxn)
      })
    })
  }
}

const firestore = admin.firestore()
