import {
  pgp,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { Contract, MarketContract } from 'common/contract'
import { groupBy, mapValues, orderBy, sumBy, uniq, uniqBy } from 'lodash'
import { LimitBet, maker } from 'common/bet'
import { ContractMetric } from 'common/contract-metric'
import { MarginalBet } from 'common/calculate-metrics'
import { floatingEqual } from 'common/util/math'
import { bulkUpdateUserMetricsWithNewBetsOnly } from 'shared/helpers/user-contract-metrics'
import { log } from 'shared/monitoring/log'
import { redeemShares } from 'api/redeem-shares'
import { convertBet } from 'common/supabase/bets'
import { APIError } from 'common/api/utils'
import { User } from 'common/user'
import { CandidateBet } from 'common/new-bet'
import {
  BANNED_TRADING_USER_IDS,
  BOT_USERNAMES,
  INSTITUTIONAL_PARTNER_USER_IDS,
  isAdminId,
  PARTNER_USER_IDS,
} from 'common/envs/constants'
import { Answer } from 'common/answer'
import {
  UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { removeUndefinedProps } from 'common/util/object'
import { UniqueBettorBonusTxn } from 'common/txn'
import { getInsertQuery } from 'shared/supabase/utils'
import { txnToRow } from 'shared/txn/run-txn'
import { contractColumnsToSelect, isProd } from 'shared/utils'
import { convertUser } from 'common/supabase/users'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { NewBetResult } from 'api/place-bet'

export const fetchContractBetDataAndValidate = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  body: {
    contractId: string
    amount: number | undefined
    answerId?: string
    answerIds?: string[]
    outcome: 'YES' | 'NO'
  },
  uid: string,
  isApi: boolean
) => {
  const startTime = Date.now()
  const { amount, contractId, outcome } = body
  const answerIds =
    'answerIds' in body
      ? body.answerIds
      : 'answerId' in body && body.answerId !== undefined
      ? [body.answerId]
      : undefined

  const isSumsToOne = `(select coalesce((data->>'shouldAnswersSumToOne')::boolean, false) from contracts where id = $2)`
  const whereLimitOrderBets = `
    b.contract_id = $2 and not b.is_filled and not b.is_cancelled and (
      -- For sums to one markets:
      (${isSumsToOne} and (
        -- Get opposite outcome bets for selected answers
        ($3 is null or b.answer_id in ($3:list)) and b.outcome != $4
        or
        -- Get same outcome bets for other answers
        ($3 is null or b.answer_id not in ($3:list)) and b.outcome = $4
      ))
      or
      -- For non-sums to one markets, just get opposite outcome bets
      (not ${isSumsToOne} and ($3 is null or b.answer_id in ($3:list)) and b.outcome != $4)
    )
  `
  const queries = pgp.as.format(
    `
    select * from users where id = $1;
    select ${contractColumnsToSelect} from contracts where id = $2;
    select * from answers
      where contract_id = $2 and (
        $3 is null or id in ($3:list) or ${isSumsToOne}
      );
    select b.*, u.balance, u.cash_balance from contract_bets b join users u on b.user_id = u.id
      where ${whereLimitOrderBets};
    -- My contract metrics
    select data from user_contract_metrics ucm where 
      contract_id = $2 and user_id = $1
      and (
        -- Get metrics for selected answers
        $3 is null or ucm.answer_id in ($3:list)
        or
        -- Get null answer metrics
        ucm.answer_id is null
      ); 
    -- Limit orderers' contract metrics
    with matching_user_answer_pairs as (
      select distinct b.user_id, b.answer_id
      from contract_bets b
      where ${whereLimitOrderBets}
    )
    select data from user_contract_metrics ucm
    where contract_id = $2
      and user_id in (select user_id from matching_user_answer_pairs)
      and (answer_id in (select answer_id from matching_user_answer_pairs)
        or answer_id is null);
    select status from system_trading_status where token = (select token from contracts where id = $2);
  `,
    [uid, contractId, answerIds ?? null, outcome]
  )
  const results = await pgTrans.multi(queries)
  const user = convertUser(results[0][0])
  const contract = convertContract(results[1][0])
  const answers = results[2].map(convertAnswer)
  const unfilledBets = results[3].map(convertBet) as (LimitBet & {
    balance: number
    cash_balance: number
  })[]
  const myContractMetrics = results[4].map((r) => r.data as ContractMetric)
  // We get slightly more contract metrics than we need bc the contract_metrics index works poorly when selecting
  // (user_id, answer_id) in (select user_id, answer_id from matching_user_answer_pairs)
  const limitOrderersContractMetrics = results[5]
    .map((r) => r.data as ContractMetric)
    .filter((m) =>
      unfilledBets.some(
        (b) =>
          b.userId === m.userId &&
          (b.answerId === m.answerId || m.answerId === null)
      )
    )
  const contractMetrics = uniqBy(
    [...myContractMetrics, ...limitOrderersContractMetrics],
    (m) => m.userId + m.answerId + m.contractId
  )
  const systemStatus = results[6][0]

  if (!systemStatus.status) {
    throw new APIError(
      403,
      `Trading with ${contract.token} is currently disabled.`
    )
  }

  if (!user) throw new APIError(404, 'User not found.')
  if (!contract) throw new APIError(404, 'Contract not found.')
  if (contract.mechanism === 'none' || contract.mechanism === 'qf')
    throw new APIError(400, 'This is not a market')

  const { closeTime, isResolved } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Trading is closed.')
  if (isResolved) throw new APIError(403, 'Market is resolved.')

  const balanceByUserId = Object.fromEntries(
    uniqBy(unfilledBets, (b) => b.userId).map((bet) => [
      bet.userId,
      contract.token === 'CASH' ? bet.cash_balance : bet.balance,
    ])
  )
  const unfilledBetUserIds = Object.keys(balanceByUserId)
  const balance = contract.token === 'CASH' ? user.cashBalance : user.balance
  if (amount !== undefined && balance < amount)
    throw new APIError(403, 'Insufficient balance.')
  if (
    (!user.sweepstakesVerified || !user.idVerified) &&
    contract.token === 'CASH' &&
    !INSTITUTIONAL_PARTNER_USER_IDS.includes(user.id)
  ) {
    throw new APIError(
      403,
      'You must be kyc verified to trade on sweepstakes markets.'
    )
  }
  if (isAdminId(user.id) && contract.token === 'CASH' && isProd()) {
    throw new APIError(403, 'Admins cannot trade on sweepstakes markets.')
  }
  if (BANNED_TRADING_USER_IDS.includes(user.id) || user.userDeleted) {
    throw new APIError(403, 'You are banned or deleted. And not #blessed.')
  }
  if (contract.outcomeType === 'STONK' && isApi) {
    throw new APIError(403, 'API users cannot bet on STONK contracts.')
  }
  log(
    `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
  )
  log(`Fetch bet data took ${Date.now() - startTime}ms`)

  return {
    user,
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    unfilledBetUserIds,
    contractMetrics,
  }
}

export const getUnfilledBets = async (
  pg: SupabaseDirectClient,
  contractId: string,
  answerId?: string
) => {
  return await pg.map(
    `select * from contract_bets
    where contract_id = $1
    and contract_bets.is_filled = false
    and contract_bets.is_cancelled = false
    ${answerId ? `and answer_id = $2` : ''}`,
    [contractId, answerId],
    (r) => convertBet(r) as LimitBet
  )
}
export const getUserBalancesAndMetrics = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  userIds: string[],
  contract: Contract,
  answerId?: string
) => {
  const startTime = Date.now()
  const { token, id: contractId, mechanism } = contract
  // TODO: if we pass the makers' answerIds, we don't need to fetch the metrics for all answers
  const sumsToOne =
    mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
  const results = await pgTrans.multi(
    `
      SELECT ${
        token === 'CASH' ? 'cash_balance AS balance' : 'balance'
      }, id FROM users WHERE id = ANY($1);

      select data from user_contract_metrics where user_id = any($1) and contract_id = $2 and
           ($3 is null or answer_id = $3 or answer_id is null);
    `,
    [userIds, contractId, sumsToOne ? null : answerId ?? null]
  )
  const balanceByUserId = Object.fromEntries(
    results[0].map((user) => [user.id, user.balance])
  )
  const contractMetrics = results[1].map((r) => r.data) as ContractMetric[]
  log(`Fetch user balances and metrics took ${Date.now() - startTime}ms`)
  return { balanceByUserId, contractMetrics }
}
export const getUnfilledBetsAndUserBalances = async (
  pgTrans: SupabaseTransaction,
  contract: Contract,
  userId: string,
  answerId?: string
) => {
  const unfilledBets = await getUnfilledBets(pgTrans, contract.id, answerId)
  const userIds = uniq([userId, ...unfilledBets.map((bet) => bet.userId)])
  const { balanceByUserId, contractMetrics } = await getUserBalancesAndMetrics(
    pgTrans,
    userIds,
    contract,
    answerId
  )

  return { unfilledBets, balanceByUserId, contractMetrics }
}

export const getBulkUpdateLimitOrdersQuery = (
  updates: Array<{
    id: string
    fills?: any[]
    isFilled?: boolean
    amount?: number
    shares?: number
  }>
) => {
  if (updates.length === 0) return 'select 1 where false'
  const values = updates
    .map((update) => {
      const updateData = {
        fills: update.fills,
        isFilled: update.isFilled,
        amount: update.amount,
        shares: update.shares,
      }
      return `('${update.id}', '${JSON.stringify(updateData)}'::jsonb)`
    })
    .join(',\n')

  return `UPDATE contract_bets AS c
       SET data = data || v.update
       FROM (VALUES ${values}) AS v(id, update)
       WHERE c.bet_id = v.id`
}

export const updateMakers = async (
  makersByTakerBetId: Record<string, maker[]>,
  contract: MarketContract,
  contractMetrics: ContractMetric[],
  pgTrans: SupabaseTransaction
) => {
  const allFillsAsNewBets: MarginalBet[] = []
  const allMakerIds: string[] = []
  const allSpentByUser: Record<string, number> = {}
  const allUpdates: Array<{
    id: string
    fills: any[]
    isFilled: boolean
    amount: number
    shares: number
  }> = []

  for (const [takerBetId, makers] of Object.entries(makersByTakerBetId)) {
    const makersByBet = groupBy(makers, (maker) => maker.bet.id)

    for (const makers of Object.values(makersByBet)) {
      const limitOrderBet = makers[0].bet
      const newFills = makers.map((maker) => {
        const { amount, shares, timestamp } = maker
        return { amount, shares, matchedBetId: takerBetId, timestamp }
      })
      const fills = [...limitOrderBet.fills, ...newFills]
      const totalShares = sumBy(fills, 'shares')
      const totalAmount = sumBy(fills, 'amount')
      const isFilled = floatingEqual(totalAmount, limitOrderBet.orderAmount)
      allFillsAsNewBets.push({
        ...limitOrderBet,
        amount: sumBy(newFills, 'amount'),
        shares: sumBy(newFills, 'shares'),
        createdTime: orderBy(newFills, 'timestamp', 'desc')[0].timestamp,
        loanAmount: 0,
        isRedemption: false,
      })
      allUpdates.push({
        id: limitOrderBet.id,
        fills,
        isFilled,
        amount: totalAmount,
        shares: totalShares,
      })
    }

    const spentByUser = mapValues(
      groupBy(makers, (maker) => maker.bet.userId),
      (makers) => sumBy(makers, (maker) => maker.amount)
    )

    for (const [userId, spent] of Object.entries(spentByUser)) {
      allSpentByUser[userId] = (allSpentByUser[userId] || 0) + spent
    }

    allMakerIds.push(...Object.keys(spentByUser))
  }

  if (allUpdates.length === 0) {
    return {
      betsToInsert: [],
      updatedMetrics: contractMetrics,
      balanceUpdates: [],
      bulkUpdateLimitOrdersQuery: 'select 1 where false',
    }
  }

  const allUpdatedMetrics = await bulkUpdateUserMetricsWithNewBetsOnly(
    pgTrans,
    allFillsAsNewBets,
    contractMetrics,
    false
  )

  const bulkLimitOrderBalanceUpdates = Object.entries(allSpentByUser).map(
    ([userId, spent]) => ({
      id: userId,
      [contract.token === 'CASH' ? 'cashBalance' : 'balance']: -spent,
    })
  )

  const makerIds = uniq(allMakerIds)
  log('Redeeming shares for makers', makerIds)
  const {
    betsToInsert: redemptionBets,
    updatedMetrics: redemptionUpdatedMetrics,
    balanceUpdates: redemptionBalanceUpdates,
  } = await redeemShares(
    pgTrans,
    makerIds,
    contract,
    allFillsAsNewBets,
    allUpdatedMetrics
  )

  return {
    betsToInsert: redemptionBets,
    updatedMetrics: redemptionUpdatedMetrics,
    balanceUpdates: redemptionBalanceUpdates.concat(
      bulkLimitOrderBalanceUpdates
    ),
    bulkUpdateLimitOrdersQuery: getBulkUpdateLimitOrdersQuery(allUpdates),
  }
}

export const getRoundedLimitProb = (limitProb: number | undefined) => {
  if (limitProb === undefined) return limitProb
  const isRounded = floatingEqual(Math.round(limitProb * 100), limitProb * 100)
  if (!isRounded)
    throw new APIError(
      400,
      'limitProb must be in increments of 0.01 (i.e. whole percentage points)'
    )

  return Math.round(limitProb * 100) / 100
}

export const getMakerIdsFromBetResult = (result: NewBetResult) => {
  const { makers = [], otherBetResults = [], ordersToCancel = [] } = result

  const makerUserIds = [
    ...makers,
    ...otherBetResults.flatMap((r) => r.makers),
  ].map((m) => m.bet.userId)

  const cancelledUserIds = [
    ...ordersToCancel,
    ...otherBetResults.flatMap((r) => r.ordersToCancel),
  ].map((o) => o.userId)

  return uniq([...makerUserIds, ...cancelledUserIds])
}

export const getUniqueBettorBonusQuery = (
  contract: Contract,
  bettor: User,
  bet: CandidateBet
) => {
  const { answerId, isRedemption, isApi } = bet

  const isBot = BOT_USERNAMES.includes(bettor.username)
  const isUnlisted = contract.visibility === 'unlisted'

  const answer =
    answerId && 'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id == answerId)
      : undefined
  const answerCreatorId = answer?.userId
  const creatorId = answerCreatorId ?? contract.creatorId
  const isCreator = bettor.id == creatorId
  const isUnfilledLimitOrder =
    bet.limitProb !== undefined && (!bet.fills || bet.fills.length === 0)

  const isPartner =
    PARTNER_USER_IDS.includes(contract.creatorId) &&
    // Require the contract creator to also be the answer creator for real-money bonus.
    creatorId === contract.creatorId

  if (
    isCreator ||
    isBot ||
    isUnlisted ||
    isRedemption ||
    isUnfilledLimitOrder ||
    isApi
  )
    return {
      balanceUpdate: undefined,
      txnQuery: 'select 1 where false',
    }

  // ian: removed the diminishing bonuses, but we could add them back via contract.uniqueBettorCount
  const bonusAmount =
    contract.mechanism === 'cpmm-multi-1'
      ? UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT
      : UNIQUE_BETTOR_BONUS_AMOUNT

  const bonusTxnData = removeUndefinedProps({
    contractId: contract.id,
    uniqueNewBettorId: bettor.id,
    answerId,
    isPartner,
  })

  const bonusTxn: Omit<UniqueBettorBonusTxn, 'id' | 'createdTime'> = {
    fromType: 'BANK',
    fromId: 'BANK',
    toId: creatorId,
    toType: 'USER',
    amount: bonusAmount,
    token: 'M$',
    category: 'UNIQUE_BETTOR_BONUS',
    data: bonusTxnData,
  } as const
  const balanceUpdate = {
    id: bonusTxn.toId,
    balance: bonusAmount,
    totalDeposits: bonusAmount,
  }
  const txnQuery = getInsertQuery('txns', txnToRow(bonusTxn))

  log(`Bonus txn for user: ${contract.creatorId} constructed:`, bonusTxn)
  return {
    balanceUpdate,
    txnQuery,
  }
}
