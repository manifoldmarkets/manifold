import { log, getUsers, revalidateContractStaticProps } from 'shared/utils'
import { Bet, LimitBet, maker } from 'common/bet'
import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
  Contract,
} from 'common/contract'
import { humanish, User } from 'common/user'
import { groupBy, keyBy, sortBy, sumBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import {
  createBetFillNotification,
  createBetReplyToCommentNotification,
  createBettingStreakBonusNotification,
  createFollowSuggestionNotification,
  createLimitBetCanceledNotification,
  createNewBettorNotification,
} from 'shared/create-notification'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { convertBet } from 'common/supabase/bets'
import { BOT_USERNAMES, TWOMBA_ENABLED } from 'common/envs/constants'
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import { getCommentSafe } from 'shared/supabase/contract-comments'
import { getBetsRepliedToComment } from 'shared/supabase/bets'
import { updateData } from 'shared/supabase/utils'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  BETTING_STREAK_SWEEPS_BONUS_AMOUNT,
  BETTING_STREAK_SWEEPS_BONUS_MAX,
  MAX_TRADERS_FOR_BIG_BONUS,
  SMALL_UNIQUE_BETTOR_LIQUIDITY,
  UNIQUE_BETTOR_LIQUIDITY,
} from 'common/economy'
import { BettingStreakBonusTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { updateContract } from 'shared/supabase/contracts'
import { Answer } from 'common/answer'
import { removeNullOrUndefinedProps } from 'common/util/object'
import {
  addHouseSubsidy,
  addHouseSubsidyToAnswer,
} from 'shared/helpers/add-house-subsidy'
import { debounce } from 'api/helpers/debounce'
import { Fees } from 'common/fees'
import { broadcastNewBets } from 'shared/websockets/helpers'
import { getAnswersForContract } from 'shared/supabase/answers'
import { followContractInternal } from 'api/follow-contract'

export const onCreateBets = async (
  bets: Bet[],
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
  originalBettor: User,
  ordersToCancel: LimitBet[] | undefined,
  makers: maker[] | undefined,
  streakIncremented: boolean
) => {
  const pg = createSupabaseDirectClient()
  broadcastNewBets(contract.id, contract.visibility, bets)
  debouncedContractUpdates(contract)

  await Promise.all(
    ordersToCancel?.map((order) => {
      createLimitBetCanceledNotification(
        originalBettor,
        order.userId,
        order,
        makers?.find((m) => m.bet.id === order.id)?.amount ?? 0,
        contract
      )
    }) ?? []
  )

  const usersToRefreshMetrics = bets.some((b) => !b.isApi && b.shares !== 0)
    ? [originalBettor]
    : []

  await Promise.all(
    bets.map(async (bet) => {
      const idempotentId = bet.id + bet.contractId + '-limit-fill'
      const notifiedUsers = await notifyUsersOfLimitFills(
        bet,
        contract,
        idempotentId
      )
      usersToRefreshMetrics.push(...(notifiedUsers ?? []))
    })
  )
  // if (usersToRefreshMetrics.length > 0) {
  //   await updateUserContractMetrics(
  //     contract,
  //     uniqBy(usersToRefreshMetrics, 'id'),
  //     pg
  //   )
  //   log(`Contract metrics updated for ${usersToRefreshMetrics.length} users.`)
  // }
  const replyBet = bets.find((bet) => bet.replyToCommentId)

  const nonRedemptionNonApiBets = sortBy(
    bets.filter((bet) => !bet.isRedemption && !bet.isApi),
    (b) => b.createdTime
  )

  // We only update the following (streaks, etc.) for non-redemption, non-api bets
  if (nonRedemptionNonApiBets.length === 0) return

  const earliestBet = nonRedemptionNonApiBets[0]

  await Promise.all([
    !originalBettor.lastBetTime &&
      (await createFollowSuggestionNotification(
        originalBettor.id,
        contract,
        pg
      )),
    streakIncremented &&
      (await payBettingStreak(originalBettor, earliestBet, contract)),
    replyBet &&
      (await handleBetReplyToComment(replyBet, contract, originalBettor, pg)),
    followContractInternal(pg, contract.id, true, originalBettor.id),
    sendUniqueBettorNotificationToCreator(
      contract,
      originalBettor,
      earliestBet,
      nonRedemptionNonApiBets
    ),
    addToLeagueIfNotInOne(pg, originalBettor.id),
  ])
}

const debouncedContractUpdates = (contract: Contract) => {
  const writeUpdates = async () => {
    const pg = createSupabaseDirectClient()
    const { uniqueBettorCount } = contract
    const result = await pg.oneOrNone(
      `
          select
              coalesce(sum(abs(amount)), 0) as volume,
              max(created_time) as time,
              count(distinct user_id)::numeric as count,
              count(distinct case when created_time > now() - interval '1 day' and not is_redemption then user_id end)::numeric as count_day,
              coalesce(sum((data->'fees'->>'creatorFee')::numeric), 0) AS creator_fee,
              coalesce(sum((data->'fees'->>'platformFee')::numeric), 0) AS platform_fee,
              coalesce(sum((data->'fees'->>'liquidityFee')::numeric), 0) AS liquidity_fee
          FROM contract_bets
          WHERE contract_id = $1
      `,
      [contract.id]
    )
    const {
      volume,
      time: lastBetTime,
      count,
      count_day,
      creator_fee,
      platform_fee,
      liquidity_fee,
    } = result
    const collectedFees: Fees = {
      creatorFee: creator_fee ?? 0,
      platformFee: platform_fee ?? 0,
      liquidityFee: liquidity_fee ?? 0,
    }
    log('Got updated stats for contract id: ' + contract.id, {
      volume,
      lastBetTime,
      count,
      count_day,
      collectedFees,
    })

    await updateContract(
      pg,
      contract.id,
      removeNullOrUndefinedProps({
        volume,
        lastBetTime: lastBetTime ? new Date(lastBetTime).valueOf() : undefined,
        lastUpdatedTime: Date.now(),
        uniqueBettorCount: uniqueBettorCount !== count ? count : undefined,
        uniqueBettorCountDay: count_day,
        collectedFees,
      })
    )
    log('Wrote debounced updates for contract id: ' + contract.id)
    await revalidateContractStaticProps(contract)
    log('Contract static props revalidated.')
  }
  debounce(
    `update-contract-props-and-static-props-${contract.id}`,
    writeUpdates,
    3000
  )
}

const notifyUsersOfLimitFills = async (
  bet: Bet,
  contract: Contract,
  eventId: string
) => {
  if (!bet.fills || !bet.fills.length) return
  const pg = createSupabaseDirectClient()

  const matchingLimitBetIds = filterDefined(
    bet.fills.map((fill) => fill.matchedBetId)
  )
  if (!matchingLimitBetIds.length) return

  const matchingLimitBets = filterDefined(
    await pg.map(
      `select * from contract_bets where bet_id in ($1:list)`,
      [matchingLimitBetIds],
      (r) => convertBet(r) as LimitBet
    )
  ).flat()

  const matchingLimitBetUsers = await getUsers(
    matchingLimitBets.map((bet) => bet.userId)
  )

  const limitBetUsersById = keyBy(filterDefined(matchingLimitBetUsers), 'id')

  return filterDefined(
    await Promise.all(
      matchingLimitBets.map(async (matchedBet) => {
        const matchedUser = limitBetUsersById[matchedBet.userId]
        if (!matchedUser) return undefined

        await createBetFillNotification(
          matchedUser,
          bet,
          matchedBet,
          contract,
          eventId
        )
        return matchedUser
      })
    )
  )
}

const updateUserContractMetrics = async (
  contract: Contract,
  users: User[],
  pg: SupabaseDirectClient
) => {
  const answers =
    contract.mechanism === 'cpmm-multi-1'
      ? await getAnswersForContract(pg, contract.id)
      : []

  const metrics = await Promise.all(
    users.map(async (user) => {
      const bets = await pg.map(
        `select * from contract_bets where contract_id = $1 and user_id = $2`,
        [contract.id, user.id],
        convertBet
      )

      return calculateUserMetrics(contract, bets, user, answers)
    })
  )

  await bulkUpdateContractMetrics(metrics.flat())
}

const handleBetReplyToComment = async (
  bet: Bet,
  contract: Contract,
  bettor: User,
  pg: SupabaseDirectClient
) => {
  if (!bet.replyToCommentId) return

  const comment = await getCommentSafe(pg, bet.replyToCommentId)

  if (!comment) return

  const allBetReplies = await getBetsRepliedToComment(pg, comment, contract.id)
  const bets = filterDefined(allBetReplies)
  // This could potentially miss some bets if they're not replicated in time
  if (!bets.some((b) => b.id === bet.id)) bets.push(bet)
  const groupedBetsByOutcome = groupBy(bets, 'outcome')
  const betReplyAmountsByOutcome: { [outcome: string]: number } = {}
  for (const outcome in groupedBetsByOutcome) {
    betReplyAmountsByOutcome[outcome] = sumBy(
      groupedBetsByOutcome[outcome],
      (b) => b.amount
    )
  }

  await updateData(pg, 'contract_comments', 'comment_id', {
    comment_id: bet.replyToCommentId,
    betReplyAmountsByOutcome,
  })
  await createBetReplyToCommentNotification(
    comment.userId,
    contract,
    bet,
    bettor,
    comment,
    pg
  )
}

const payBettingStreak = async (
  oldUser: User,
  bet: Bet,
  contract: Contract
) => {
  const pg = createSupabaseDirectClient()
  const result = await pg.tx(async (tx) => {
    const newBettingStreak = (oldUser.currentBettingStreak ?? 0) + 1
    if (!humanish(oldUser)) {
      return {
        bonusAmount: 0,
        sweepsBonusAmount: 0,
        newBettingStreak,
        txn: { id: bet.id },
        sweepsTxn: null,
      }
    }

    // Send them the bonus times their streak
    const bonusAmount = Math.min(
      BETTING_STREAK_BONUS_AMOUNT * newBettingStreak,
      BETTING_STREAK_BONUS_MAX
    )

    const bonusTxnDetails = {
      currentBettingStreak: newBettingStreak,
      contractId: contract.id,
    }

    const bonusTxn: Omit<
      BettingStreakBonusTxn,
      'id' | 'createdTime' | 'fromId'
    > = {
      fromType: 'BANK',
      toId: oldUser.id,
      toType: 'USER',
      amount: bonusAmount,
      token: 'M$',
      category: 'BETTING_STREAK_BONUS',
      data: bonusTxnDetails,
    }

    const txn = await runTxnFromBank(tx, bonusTxn)

    let sweepsTxn = null
    let sweepsBonusAmount = 0
    if (oldUser.sweepstakesVerified && TWOMBA_ENABLED) {
      sweepsBonusAmount = Math.min(
        BETTING_STREAK_SWEEPS_BONUS_AMOUNT * newBettingStreak,
        BETTING_STREAK_SWEEPS_BONUS_MAX
      )

      const sweepsBonusTxn: Omit<
        BettingStreakBonusTxn,
        'id' | 'createdTime' | 'fromId'
      > = {
        fromType: 'BANK',
        toId: oldUser.id,
        toType: 'USER',
        amount: sweepsBonusAmount,
        token: 'CASH',
        category: 'BETTING_STREAK_BONUS',
        data: bonusTxnDetails,
      }

      sweepsTxn = await runTxnFromBank(tx, sweepsBonusTxn)
    }

    return { txn, sweepsTxn, bonusAmount, sweepsBonusAmount, newBettingStreak }
  })

  await createBettingStreakBonusNotification(
    oldUser,
    result.txn.id,
    bet,
    contract,
    result.bonusAmount,
    result.newBettingStreak,
    result.sweepsTxn ? result.sweepsBonusAmount : undefined
  )
}

export const sendUniqueBettorNotificationToCreator = async (
  contract: Contract,
  bettor: User,
  bet: Bet,
  usersNonRedemptionBets?: Bet[]
) => {
  const { answerId, isRedemption, isApi } = bet
  const pg = createSupabaseDirectClient()

  const isBot = BOT_USERNAMES.includes(bettor.username)

  const answer =
    answerId && 'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id == answerId)
      : undefined
  const answerCreatorId = answer?.userId
  const creatorId = answerCreatorId ?? contract.creatorId
  const isCreator = bettor.id == creatorId

  if (isCreator || isBot || isRedemption || isApi) return

  const previousBet = await pg.oneOrNone(
    `select bet_id from contract_bets
        where contract_id = $1
          and ($2 is null or answer_id = $2)
          and user_id = $3
          and created_time < $4
          and is_redemption = false
        limit 1`,
    [contract.id, answerId, bettor.id, new Date(bet.createdTime).toISOString()]
  )
  // Check previous bet.
  if (previousBet) return

  await createNewBettorNotification(
    creatorId,
    bettor,
    contract,
    bet,
    usersNonRedemptionBets
  )
}

export const injectLiquidityBonus = async (
  contract: Contract,
  bet: Bet,
  uniqueBettorIds: string[]
) => {
  const subsidy =
    uniqueBettorIds.length <= MAX_TRADERS_FOR_BIG_BONUS
      ? UNIQUE_BETTOR_LIQUIDITY
      : SMALL_UNIQUE_BETTOR_LIQUIDITY

  if (contract.mechanism === 'cpmm-1') {
    await addHouseSubsidy(contract.id, subsidy)
  } else if (contract.mechanism === 'cpmm-multi-1' && bet.answerId) {
    if (
      contract.shouldAnswersSumToOne &&
      (bet.probAfter < 0.15 || bet.probAfter > 0.95)
    ) {
      // There are two ways to subsidize multi answer contracts when they sum to one:
      // 1. Subsidize all answers (and gain efficiency b/c only one answer resolves YES.)
      // 2. Subsidize one answer (and throw away excess YES or NO shares to maintain probability.)
      // The second if preferred if the probability is not extreme, because it increases
      // liquidity in a more traded answer. (Liquidity in less traded or unlikely answers is not that important.)
      await addHouseSubsidy(contract.id, subsidy)
    } else {
      await addHouseSubsidyToAnswer(contract.id, bet.answerId, subsidy)
    }
  }
}
