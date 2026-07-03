import { followContractInternal } from 'api/follow-contract'
import {
  getUnfilledBets,
  getUnfilledBetsAndUserBalances,
  updateMakers,
} from 'api/helpers/bets'
import { Answer, getMaximumAnswers } from 'common/answer'
import { getCpmmInitialLiquidity } from 'common/antes'
import { Bet, getNewBetId, LimitBet, maker } from 'common/bet'
import {
  addCpmmMultiLiquidityAnswersSumToOne,
  getCpmmLiquidity,
  getCpmmProbability,
  pForProbability,
} from 'common/calculate-cpmm'
import {
  CPMMMultiContract,
  isMultiCpmm,
  MIN_CPMM_PROB,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { isAdminId } from 'common/envs/constants'
import { noFees } from 'common/fees'
import { getBetDownToOneMultiBetInfo } from 'common/new-bet'
import { convertBet } from 'common/supabase/bets'
import { getAnswerCostFromLiquidity } from 'common/tier'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import { EPSILON, floatingEqual } from 'common/util/math'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'
import { groupBy, partition, sumBy, uniq } from 'lodash'
import { createNewAnswerOnContractNotification } from 'shared/create-notification'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  bulkUpdateContractMetricsQuery,
  getContractMetrics,
} from 'shared/helpers/user-contract-metrics'
import {
  getAnswersForContract,
  insertAnswer,
  updateAnswer,
  updateAnswers,
} from 'shared/supabase/answers'
import {
  bulkInsertBets,
  bulkInsertBetsQuery,
  cancelLimitOrders,
  insertBet,
} from 'shared/supabase/bets'
import { updateContract } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { insertLiquidity } from 'shared/supabase/liquidity'
import {
  broadcastUserUpdates,
  bulkIncrementBalancesQuery,
  incrementBalance,
  UserUpdate,
} from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { getContractSupabase, getUser, log } from 'shared/utils'
import { broadcastUpdatedMetrics } from 'shared/websockets/helpers'
import { APIError, APIHandler } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'
import { redeemShares } from './redeem-shares'

// (GPnn labels cite machine-checked proofs: https://github.com/evand/manifold-math/tree/main/cpmm-multi-2/proofs)
export const createAnswerCPMM: APIHandler<'market/:contractId/answer'> =
  onlyUsersWhoCanPerformAction('createAnswer', async (props, auth) => {
    const { contractId, text } = props
    return await betsQueue.enqueueFn(
      () => createAnswerCpmmFull(contractId, text, auth.uid),
      [contractId, auth.uid]
    )
  })
const createAnswerCpmmFull = async (
  contractId: string,
  text: string,
  userId: string
) => {
  log('Received ' + contractId + ' ' + text)
  const contract = await verifyContract(contractId, userId)
  return await createAnswerCpmmMain(contract, text, userId)
}

const verifyContract = async (contractId: string, creatorId: string) => {
  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, 'Contract not found')
  if (contract.token !== 'MANA') {
    throw new APIError(403, 'Cannot add answers to sweepstakes question')
  }
  if (!isMultiCpmm(contract))
    throw new APIError(403, 'Requires a cpmm multiple choice contract')
  if (contract.outcomeType === 'NUMBER')
    throw new APIError(403, 'Cannot create new answers for numeric contracts')

  const { closeTime } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Trading is closed')

  const addAnswersMode = contract.addAnswersMode

  if (!addAnswersMode || addAnswersMode === 'DISABLED') {
    throw new APIError(400, 'Adding answers is disabled')
  }

  if (
    contract.addAnswersMode === 'ONLY_CREATOR' &&
    contract.creatorId !== creatorId &&
    !isAdminId(creatorId)
  ) {
    throw new APIError(403, 'Only the creator or an admin can create an answer')
  }

  return contract
}

const createAnswerCpmmMain = async (
  contract: Awaited<ReturnType<typeof verifyContract>>,
  text: string,
  creatorId: string
) => {
  const { shouldAnswersSumToOne } = contract

  const answerCost = getAnswerCostFromLiquidity(
    contract.totalLiquidity,
    contract.answers.length
  )

  const { newAnswer, user } = await runTransactionWithRetries(
    async (pgTrans) => {
      const user = await getUser(creatorId, pgTrans)
      if (!user) throw new APIError(401, 'Your account was not found')

      if (user.balance < answerCost)
        throw new APIError(403, 'Insufficient balance, need M' + answerCost)

      await incrementBalance(pgTrans, user.id, {
        balance: -answerCost,
        totalDeposits: -answerCost,
      })

      const answers = await getAnswersForContract(pgTrans, contract.id)

      const unresolvedAnswers = answers.filter((a) => !a.resolution)
      const maxAnswers = getMaximumAnswers(shouldAnswersSumToOne)
      if (unresolvedAnswers.length >= maxAnswers) {
        throw new APIError(
          403,
          `Cannot add an answer: Maximum number (${maxAnswers}) of open answers reached.`
        )
      }

      const poolYes = answerCost
      const poolNo = answerCost
      const totalLiquidity = answerCost
      const prob = 0.5

      const id = randomString()
      const n = answers.length
      const createdTime = Date.now()
      const newAnswer: Answer = removeUndefinedProps({
        id,
        index: n,
        contractId: contract.id,
        createdTime,
        userId: user.id,
        text,
        isOther: false,
        poolYes,
        poolNo,
        p: 0.5, // balanced pool at p=0.5; v2 lossless split sets per-answer p (PR2 late add-on)
        prob,
        totalLiquidity,
        subsidyPool: 0,
        probChanges: { day: 0, week: 0, month: 0 },
        volume: 0,
      })

      const updatedAnswers: Answer[] = []
      if (shouldAnswersSumToOne) {
        // cpmm-multi-2: lossless refinement split (GP18). v1 path stays frozen.
        if (contract.mechanism === 'cpmm-multi-2') {
          await createAnswerAndSumAnswersToOneV2(
            pgTrans,
            user,
            contract,
            answers,
            newAnswer,
            answerCost
          )
        } else {
          await createAnswerAndSumAnswersToOne(
            pgTrans,
            user,
            contract,
            answers,
            newAnswer,
            answerCost
          )
        }
        const updatedAnswers = await getAnswersForContract(pgTrans, contract.id)
        await convertOtherAnswerShares(
          pgTrans,
          contract,
          updatedAnswers,
          newAnswer.id
        )
      } else {
        await insertAnswer(pgTrans, newAnswer)
      }

      await updateContract(pgTrans, contract.id, {
        totalLiquidity: FieldVal.increment(answerCost),
      })

      const lp = getCpmmInitialLiquidity(
        user.id,
        contract,
        answerCost,
        createdTime,
        newAnswer.id
      )

      await insertLiquidity(pgTrans, lp)

      return { newAnswer, updatedAnswers, user }
    }
  )

  const continuation = async () => {
    await createNewAnswerOnContractNotification(
      newAnswer.id,
      user,
      text,
      contract
    )
    const pg = createSupabaseDirectClient()
    await followContractInternal(pg, contract.id, true, creatorId)
  }
  return { result: { newAnswerId: newAnswer.id }, continue: continuation }
}

async function createAnswerAndSumAnswersToOne(
  pgTrans: SupabaseTransaction,
  user: User,
  contract: CPMMMultiContract,
  answers: Answer[],
  newAnswer: Answer,
  answerCost: number
) {
  const [otherAnswers, answersWithoutOther] = partition(
    answers,
    (a) => a.isOther
  )
  const otherAnswer = otherAnswers[0]
  if (!otherAnswer) {
    throw new APIError(
      500,
      '"Other" answer not found, and is required for adding new answers.'
    )
  }

  // 1. Create a mana budget including answerCost, and shares from Other.
  // 2. Keep track of excess Yes and No shares of Other. Other has been divided
  // into three pieces: mana, excessYesShares, excessNoShares.
  // 3a. Recreate liquidity for the new answer and other by spending mana.
  // 3b. Add excessYesShares to both other and the new answer's pools.
  // These Yes shares can be copied because, conceptually, if the new answer is split out of Other,
  // then original yes shares in Other should pay out if either it or Other is chosen.
  // Note that the new answer has up to answerCost liquidity, while the remainder of liquidity,
  // which could be a lot, is spent on the other answer.
  // 4. Convert excess No shares in Other into Yes shares in all the previous answers and add them
  // to previous answers' pools.
  // 5. Probability sum is now greater than 1. Bet it down equally.
  // Proof of >1 prob sum:
  // a. If there are excess Yes shares, then old answer probs are unchanged, so
  // prob of new answer + prob of other answer must be > than previous prob of other answer. Empirically true...
  // b. If there are excess No shares, then new answer & other answer each has 50% prob.
  // 6. Betting it down to 1 produces mana, which we then insert as subsidy.
  const mana = answerCost + Math.min(otherAnswer.poolYes, otherAnswer.poolNo)
  const excessYesShares = Math.max(0, otherAnswer.poolYes - otherAnswer.poolNo)
  const excessNoShares = Math.max(0, otherAnswer.poolNo - otherAnswer.poolYes)

  const answerCostOrHalf = Math.min(answerCost, mana / 2)
  const newAnswerPool = {
    YES: answerCostOrHalf + excessYesShares,
    NO: answerCostOrHalf,
  }
  const newOtherPool = {
    YES: mana - answerCostOrHalf + excessYesShares,
    NO: mana - answerCostOrHalf,
  }

  const newAnswerProb = getCpmmProbability(newAnswerPool, 0.5)
  const otherProb = getCpmmProbability(newOtherPool, 0.5)
  const n = answers.length

  newAnswer = {
    ...newAnswer,
    index: n - 1,
    poolYes: newAnswerPool.YES,
    poolNo: newAnswerPool.NO,
    prob: newAnswerProb,
    totalLiquidity: answerCostOrHalf,
  }

  const updatedOtherAnswerProps = {
    totalLiquidity: newOtherPool.NO,
    index: n,
  }

  const updatedOtherAnswer = {
    ...otherAnswer,
    ...updatedOtherAnswerProps,
    poolYes: newOtherPool.YES,
    poolNo: newOtherPool.NO,
    prob: otherProb,
  }

  const updatedPreviousAnswers = answersWithoutOther.map((a) => ({
    ...a,
    poolYes: a.poolYes + excessNoShares,
  }))

  const answersWithNewAnswer = [
    ...updatedPreviousAnswers,
    newAnswer,
    updatedOtherAnswer,
  ]
  const { unfilledBets, balanceByUserId, contractMetrics } =
    await getUnfilledBetsAndUserBalances(pgTrans, contract, user.id)

  // Cancel limit orders on Other answer.
  const [unfilledBetsOnOther, unfilledBetsExcludingOther] = partition(
    unfilledBets,
    (b) => b.answerId === otherAnswer.id
  )

  const { betResults, extraMana } = getBetDownToOneMultiBetInfo(
    contract,
    answersWithNewAnswer,
    unfilledBetsExcludingOther,
    balanceByUserId
  )

  log('New answer', { newAnswer })
  log('Other answer', { updatedOtherAnswer })
  log('extraMana ' + extraMana)
  log('bet amounts', {
    amounts: betResults.map((r) =>
      sumBy(r.takers.slice(0, r.takers.length - 1), (t) => t.amount)
    ),
    shares: betResults.map((r) =>
      sumBy(r.takers.slice(0, r.takers.length - 1), (t) => t.shares)
    ),
  })

  const poolsByAnswer = Object.fromEntries(
    betResults.map((r) => [
      r.answer.id,
      r.cpmmState.pool as { YES: number; NO: number },
    ])
  )
  for (const [answerId, pool] of Object.entries(poolsByAnswer)) {
    const { YES: poolYes, NO: poolNo } = pool
    const prob = poolNo / (poolYes + poolNo)
    log('After arbitrage answer ', {
      answerText: newAnswer.text,
      answerId,
      poolYes,
      poolNo,
      prob,
    })
  }
  const newPoolsByAnswer = addCpmmMultiLiquidityAnswersSumToOne(
    poolsByAnswer,
    extraMana
  )

  const answerUpdates: Pick<Answer, 'id' | 'poolNo' | 'poolYes' | 'prob'>[] = []
  const allOrdersToCancel: LimitBet[] = []
  const makerIDsByTakerBetId: Record<string, maker[]> = {}
  let allUpdatedMetrics: ContractMetric[] = []
  for (const result of betResults) {
    const { answer, bet, makers, ordersToCancel } = result

    const { insertedBet: betRow, updatedMetrics } = await insertBet(
      {
        userId: user.id,
        isApi: false,
        ...bet,
      },
      pgTrans,
      contractMetrics
    )
    allUpdatedMetrics = updatedMetrics
    const pool = newPoolsByAnswer[answer.id]
    const { YES: poolYes, NO: poolNo } = pool
    const prob = getCpmmProbability(pool, 0.5)
    answerUpdates.push({
      id: answer.id,
      poolYes,
      poolNo,
      prob,
    })
    if (makers) {
      makerIDsByTakerBetId[betRow.bet_id] = makers
    }

    allOrdersToCancel.push(...ordersToCancel)
  }
  const {
    betsToInsert: makerRedemptionBetsToInsert,
    updatedMetrics: makerRedemptionAndFillUpdatedMetrics,
    balanceUpdates: makerRedemptionAndFillBalanceUpdates,
    bulkUpdateLimitOrdersQuery,
  } = await updateMakers(
    makerIDsByTakerBetId,
    contract,
    allUpdatedMetrics,
    pgTrans
  )

  const makerRedemptionBetsQuery = bulkInsertBetsQuery(
    makerRedemptionBetsToInsert
  )
  const makerMetricsQuery = bulkUpdateContractMetricsQuery(
    makerRedemptionAndFillUpdatedMetrics
  )
  const makerBalanceUpdatesQuery = bulkIncrementBalancesQuery(
    makerRedemptionAndFillBalanceUpdates
  )

  const makerUpdateResults = await pgTrans.multi(`
    ${makerRedemptionBetsQuery}; --0
    ${makerMetricsQuery}; --1
    ${makerBalanceUpdatesQuery}; --2
    ${bulkUpdateLimitOrdersQuery}; --3
  `)

  const makerUserUpdates = makerUpdateResults[2] as UserUpdate[]
  for (const userUpdate of makerUserUpdates) {
    if (
      userUpdate.balance < -EPSILON &&
      userUpdate.balance < balanceByUserId[userUpdate.id]
    ) {
      throw new APIError(403, 'Maker has insufficient balance.')
    }
  }

  log('inserting new answer')
  await insertAnswer(pgTrans, newAnswer)
  log('updating index and liquidity of Other')
  await updateAnswer(pgTrans, otherAnswer.id, updatedOtherAnswerProps)

  for (const answer of answerUpdates) {
    log('Updating answer ', answer)
  }
  await updateAnswers(pgTrans, contract.id, answerUpdates)

  allOrdersToCancel.push(...unfilledBetsOnOther)
  await cancelLimitOrders(pgTrans, allOrdersToCancel)
}

// cpmm-multi-2: lossless "Other" split as a REFINEMENT (GP18, tasks/cpmm_multi_2/
// proofs/other_split_refinement.py + findings-other-split-refinement-2026-06-28.md).
// Treat Other as the event (A or Other'); adding A refines it, so it must be invariant w.r.t.
// anything that can't distinguish A from Other':
//   - copy Other's YES inventory into BOTH new pools and fund their NO with a balanced
//     answerCost/2 add (D-preserving), repriced via per-answer p to q_A = q_Other' = p_o/2;
//   - listed pools are UNTOUCHED (prices fixed) — no excess-NO dump, no bet-down;
//   - the pool's NO inventory relabels to YES in each listed answer (redemption identity:
//     NO-Other ≡ Σ YES-listed), held OFF the listed pools (so prices stay) — conserves mana
//     exactly (GP18f: keeping NO in the pools would create `No` mana);
//   - user positions are handled by convertOtherAnswerShares (the same refinement on bets).
// The v1 path (createAnswerAndSumAnswersToOne, p=0.5 surgery + overshoot + bet-down) is frozen.
async function createAnswerAndSumAnswersToOneV2(
  pgTrans: SupabaseTransaction,
  user: User,
  contract: CPMMMultiContract,
  answers: Answer[],
  newAnswer: Answer,
  answerCost: number
) {
  const [otherAnswers, answersWithoutOther] = partition(
    answers,
    (a) => a.isOther
  )
  const otherAnswer = otherAnswers[0]
  if (!otherAnswer) {
    throw new APIError(
      500,
      '"Other" answer not found, and is required for adding new answers.'
    )
  }

  const Yo = otherAnswer.poolYes
  const No = otherAnswer.poolNo
  const pOther = otherAnswer.p ?? 0.5
  const probOther = getCpmmProbability({ YES: Yo, NO: No }, pOther)
  // GP19d split floor: each split halves Other's prob mass geometrically, and both
  // children land at probOther/2 — below MIN_CPMM_PROB they'd sit under the
  // market-order clamp (untradeable-downward zombie answers). The split itself never
  // breaks strict sanity (GP19d), so this is the ONLY guard the operation needs.
  if (probOther < 2 * MIN_CPMM_PROB) {
    throw new APIError(
      403,
      `Cannot add an answer: the "Other" answer's probability (${Math.round(
        probOther * 1000
      ) / 10}%) is too low to split — both halves would fall below the ${
        MIN_CPMM_PROB * 100
      }% minimum. Trade "Other" up or resolve the market instead.`
    )
  }
  const targetProb = probOther / 2 // A and Other' each take half of Other's prob mass
  const a = answerCost / 2 // symmetric: split the added mana 50/50 (GP18e: the 1 free DOF)

  const newAnswerPool = { YES: Yo + a, NO: a }
  const newOtherPool = { YES: Yo + a, NO: a }
  const newAnswerP = pForProbability(newAnswerPool, targetProb)
  const newOtherP = pForProbability(newOtherPool, targetProb)

  const n = answers.length
  newAnswer = {
    ...newAnswer,
    index: n - 1,
    poolYes: newAnswerPool.YES,
    poolNo: newAnswerPool.NO,
    p: newAnswerP,
    prob: targetProb,
    totalLiquidity: getCpmmLiquidity(newAnswerPool, newAnswerP),
  }
  const updatedOtherAnswerProps = {
    poolYes: newOtherPool.YES,
    poolNo: newOtherPool.NO,
    p: newOtherP,
    prob: targetProb,
    index: n,
    totalLiquidity: getCpmmLiquidity(newOtherPool, newOtherP),
  }

  await insertAnswer(pgTrans, newAnswer)
  await updateAnswer(pgTrans, otherAnswer.id, updatedOtherAnswerProps)

  // Relabel the POOL's NO inventory: `No` NO-Other shares ≡ `No` YES in each listed answer
  // (redemption identity GP18a). Credit them to the LP (contract creator) as redemption bets, OFF
  // the listed pools so listed prices stay fixed. Single-LP attribution is fine for conservation;
  // multi-LP proportional attribution is a follow-up refinement.
  const now = Date.now()
  const poolNoBets: Bet[] = answersWithoutOther.map((listed) => ({
    id: getNewBetId(),
    contractId: contract.id,
    userId: contract.creatorId,
    answerId: listed.id,
    outcome: 'YES',
    shares: No,
    amount: 0,
    isCancelled: false,
    isFilled: true,
    loanAmount: 0,
    probBefore: listed.prob,
    probAfter: listed.prob,
    createdTime: now,
    fees: noFees,
    isRedemption: true,
    isApi: false,
  }))
  if (poolNoBets.length > 0) {
    const metrics = await getContractMetrics(
      pgTrans,
      [contract.creatorId],
      contract.id,
      filterDefined(poolNoBets.map((b) => b.answerId)),
      true
    )
    await bulkInsertBets(pgTrans, poolNoBets, metrics)
  }

  // Cancel Other's resting limit orders (priced at the old probability). Fetch just
  // that answer's unfilled bets — the v2 split doesn't move any listed price, so the
  // whole-contract balances/metrics load the v1 path needs is pure overhead here.
  const ordersToCancel = await getUnfilledBets(
    pgTrans,
    contract.id,
    otherAnswer.id
  )
  await cancelLimitOrders(pgTrans, ordersToCancel)
}

async function convertOtherAnswerShares(
  pgTrans: SupabaseDirectClient,
  contract: CPMMMultiContract,
  answers: Answer[],
  newAnswerId: string
) {
  const now = Date.now()

  const contractId = answers[0].contractId
  const newAnswer = answers.find((a) => a.id === newAnswerId)!
  const otherAnswer = answers.find((a) => a.isOther)!

  const bets = await pgTrans.map(
    `select * from contract_bets where contract_id = $1 and answer_id = $2`,
    [contractId, otherAnswer.id],
    convertBet
  )

  const betsByUserId = groupBy(bets, (b) => b.userId)
  const newBets: Bet[] = []

  // Gain YES shares in new answer for each YES share in Other.
  for (const [userId, bets] of Object.entries(betsByUserId)) {
    const position = sumBy(
      bets,
      (b) => b.shares * (b.outcome === 'YES' ? 1 : -1)
    )
    if (!floatingEqual(position, 0) && position > 0) {
      const freeYesSharesBet: Bet = {
        id: getNewBetId(),
        contractId,
        userId,
        answerId: newAnswer.id,
        outcome: 'YES',
        shares: position,
        amount: 0,
        isCancelled: false,
        isFilled: true,
        loanAmount: 0,
        probBefore: newAnswer.prob,
        probAfter: newAnswer.prob,
        createdTime: now,
        fees: noFees,
        isRedemption: true,
        isApi: false,
      }
      newBets.push(freeYesSharesBet)
    }
  }

  // Convert NO shares in Other answer to YES shares in all other answers (excluding new answer).
  for (const [userId, bets] of Object.entries(betsByUserId)) {
    const now = Date.now()
    const noPosition = sumBy(
      bets,
      (b) => b.shares * (b.outcome === 'YES' ? -1 : 1)
    )
    if (!floatingEqual(noPosition, 0) && noPosition > 0) {
      const convertNoSharesBet: Bet = {
        id: getNewBetId(),
        contractId,
        userId,
        answerId: otherAnswer.id,
        outcome: 'NO',
        shares: -noPosition,
        amount: 0,
        isCancelled: false,
        isFilled: true,
        loanAmount: 0,
        probBefore: otherAnswer.prob,
        probAfter: otherAnswer.prob,
        createdTime: now,
        fees: noFees,
        isRedemption: true,
        isApi: false,
      }
      newBets.push(convertNoSharesBet)

      const previousAnswers = answers.filter(
        (a) => a.id !== newAnswer.id && a.id !== otherAnswer.id
      )
      for (const answer of previousAnswers) {
        const gainYesSharesBet: Bet = {
          id: getNewBetId(),
          contractId,
          userId,
          answerId: answer.id,
          outcome: 'YES',
          shares: noPosition,
          amount: 0,
          isCancelled: false,
          isFilled: true,
          loanAmount: 0,
          probBefore: answer.prob,
          probAfter: answer.prob,
          createdTime: now,
          fees: noFees,
          isRedemption: true,
          isApi: false,
        }
        newBets.push(gainYesSharesBet)
      }
    }
  }
  const contractMetrics = await getContractMetrics(
    pgTrans,
    newBets.map((b) => b.userId),
    contractId,
    filterDefined(newBets.map((b) => b.answerId)),
    true
  )

  const { updatedMetrics } = await bulkInsertBets(
    pgTrans,
    newBets,
    contractMetrics
  )

  // Redeem shares for users who may now have both YES and NO on the same answers
  // This happens when a user had NO on Other AND NO on other answers - the conversion
  // gives them YES shares on previous answers, creating YES+NO pairs that should redeem
  const userIds = uniq(newBets.map((b) => b.userId))
  const {
    betsToInsert: redemptionBets,
    updatedMetrics: redemptionUpdatedMetrics,
    balanceUpdates,
  } = await redeemShares(pgTrans, userIds, contract, newBets, updatedMetrics)

  if (redemptionBets.length > 0) {
    log('Redeeming shares after convertOtherAnswerShares', {
      redemptionBetsCount: redemptionBets.length,
      balanceUpdatesCount: balanceUpdates.length,
    })

    // Insert redemption bets, update metrics, and update balances in one query
    // Note: We use the query builders instead of bulkInsertBets to avoid
    // double-updating metrics (redeemShares already calculated the final metrics)
    const insertBetsQuery = bulkInsertBetsQuery(redemptionBets)
    const metricsQuery = bulkUpdateContractMetricsQuery(
      redemptionUpdatedMetrics
    )
    const balanceQuery = bulkIncrementBalancesQuery(balanceUpdates)

    const results = await pgTrans.multi(
      `${insertBetsQuery}; ${metricsQuery}; ${balanceQuery}`
    )

    const userUpdates = results[2] as UserUpdate[]
    if (userUpdates.length > 0) {
      broadcastUserUpdates(userUpdates)
    }
    broadcastUpdatedMetrics(redemptionUpdatedMetrics)
  }

  return answers
}
