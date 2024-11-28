import { groupBy, partition, sumBy } from 'lodash'
import { CPMMMultiContract } from 'common/contract'
import { User } from 'common/user'
import { getBetDownToOneMultiBetInfo } from 'common/new-bet'
import { Answer, getMaximumAnswers } from 'common/answer'
import { APIError, APIHandler } from './helpers/endpoint'
import { getTieredAnswerCost } from 'common/economy'
import { randomString } from 'common/util/random'
import {
  addCpmmMultiLiquidityAnswersSumToOne,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { isAdminId } from 'common/envs/constants'
import { floatingEqual } from 'common/util/math'
import { noFees } from 'common/fees'
import { getCpmmInitialLiquidity } from 'common/antes'
import { getContractSupabase, getUser, log } from 'shared/utils'
import { createNewAnswerOnContractNotification } from 'shared/create-notification'
import { removeUndefinedProps } from 'common/util/object'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { incrementBalance } from 'shared/supabase/users'
import {
  bulkInsertBets,
  cancelLimitOrders,
  insertBet,
} from 'shared/supabase/bets'
import { convertBet } from 'common/supabase/bets'
import { betsQueue } from 'shared/helpers/fn-queue'
import { insertLiquidity } from 'shared/supabase/liquidity'
import {
  getAnswersForContract,
  insertAnswer,
  updateAnswer,
  updateAnswers,
} from 'shared/supabase/answers'
import { getTierFromLiquidity } from 'common/tier'
import { updateContract } from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { Bet, getNewBetId, LimitBet, maker } from 'common/bet'
import { followContractInternal } from 'api/follow-contract'
import { ContractMetric } from 'common/contract-metric'
import { getContractMetrics } from 'shared/helpers/user-contract-metrics'
import { filterDefined } from 'common/util/array'
import { getUnfilledBetsAndUserBalances, updateMakers } from 'api/helpers/bets'
export const createAnswerCPMM: APIHandler<'market/:contractId/answer'> = async (
  props,
  auth
) => {
  const { contractId, text } = props
  return await betsQueue.enqueueFn(
    () => createAnswerCpmmFull(contractId, text, auth.uid),
    [contractId, auth.uid]
  )
}
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
  if (contract.mechanism !== 'cpmm-multi-1')
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

  const answerCost = getTieredAnswerCost(
    getTierFromLiquidity(contract, contract.totalLiquidity)
  )

  const { newAnswer, user } = await runTransactionWithRetries(
    async (pgTrans) => {
      const user = await getUser(creatorId, pgTrans)
      if (!user) throw new APIError(401, 'Your account was not found')
      if (user.isBannedFromPosting) throw new APIError(403, 'You are banned')

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
        prob,
        totalLiquidity,
        subsidyPool: 0,
        probChanges: { day: 0, week: 0, month: 0 },
      })

      const updatedAnswers: Answer[] = []
      if (shouldAnswersSumToOne) {
        await createAnswerAndSumAnswersToOne(
          pgTrans,
          user,
          contract,
          answers,
          newAnswer,
          answerCost
        )
        const updatedAnswers = await getAnswersForContract(pgTrans, contract.id)
        await convertOtherAnswerShares(pgTrans, updatedAnswers, newAnswer.id)
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
  const { bulkUpdateLimitOrdersQuery } = await updateMakers(
    makerIDsByTakerBetId,
    contract,
    allUpdatedMetrics,
    pgTrans
  )
  await pgTrans.none(bulkUpdateLimitOrdersQuery)
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

async function convertOtherAnswerShares(
  pgTrans: SupabaseDirectClient,
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

  await bulkInsertBets(pgTrans, newBets, contractMetrics)
  return answers
}
