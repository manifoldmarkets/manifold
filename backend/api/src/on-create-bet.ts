import {
  log,
  getDoc,
  getUsers,
  revalidateContractStaticProps,
  getBettingStreakResetTimeBeforeNow,
} from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { groupBy, keyBy, sumBy, uniq, uniqBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import {
  createBetFillNotification,
  createBetReplyToCommentNotification,
  createBettingStreakBonusNotification,
  createFollowSuggestionNotification,
  createLimitBetCanceledNotification,
  createUniqueBettorBonusNotification,
} from 'shared/create-notification'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { convertBet } from 'common/supabase/bets'
import { NormalizedBet } from 'common/new-bet'
import { maker } from 'api/place-bet'
import { redeemShares } from 'api/redeem-shares'
import { BOT_USERNAMES, PARTNER_USER_IDS } from 'common/envs/constants'
import { addUserToContractFollowers } from 'shared/follow-market'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import * as admin from 'firebase-admin'
import { getCommentSafe } from 'shared/supabase/contract_comments'
import { getBetsRepliedToComment } from 'shared/supabase/bets'
import { updateData } from 'shared/supabase/utils'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  MAX_TRADERS_FOR_BIG_BONUS,
  MAX_TRADERS_FOR_BONUS,
  SMALL_UNIQUE_BETTOR_BONUS_AMOUNT,
  SMALL_UNIQUE_BETTOR_LIQUIDITY,
  UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_LIQUIDITY,
} from 'common/economy'
import { BettingStreakBonusTxn, UniqueBettorBonusTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import {
  getUniqueBettorIds,
  getUniqueBettorIdsForAnswer,
} from 'shared/supabase/contracts'
import { Answer } from 'common/answer'
import {
  removeNullOrUndefinedProps,
  removeUndefinedProps,
} from 'common/util/object'
import {
  addHouseSubsidy,
  addHouseSubsidyToAnswer,
} from 'shared/helpers/add-house-subsidy'
import { debounce } from 'api/helpers/debounce'
import { MONTH_MS } from 'common/util/time'
import { track } from 'shared/analytics'
import { FLAT_TRADE_FEE, Fees } from 'common/fees'
import { FieldValue } from 'firebase-admin/firestore'

const firestore = admin.firestore()

export const onCreateBets = async (
  normalBets: NormalizedBet[],
  contract: Contract,
  originalBettor: User,
  ordersToCancel: LimitBet[] | undefined,
  makers: maker[] | undefined
) => {
  const { mechanism } = contract
  if (mechanism === 'cpmm-1' || mechanism === 'cpmm-multi-1') {
    const userIds = uniq([
      originalBettor.id,
      ...(makers?.map((maker) => maker.bet.userId) ?? []),
    ])
    await Promise.all(
      userIds.map(async (userId) => redeemShares(userId, contract))
    )
    log('Share redemption transaction finished.')
  }

  if (ordersToCancel) {
    await Promise.all(
      ordersToCancel.map((order) => {
        createLimitBetCanceledNotification(
          originalBettor,
          order.userId,
          order,
          makers?.find((m) => m.bet.id === order.id)?.amount ?? 0,
          contract
        )
      })
    )
  }

  const betUsers = await getUsers(uniq(normalBets.map((bet) => bet.userId)))
  if (!betUsers.find((u) => u.id == originalBettor.id))
    betUsers.push(originalBettor)

  const pg = createSupabaseDirectClient()
  const bets = normalBets.map((bet) => {
    const user = betUsers.find((user) => user.id === bet.userId)
    return {
      ...bet,
      userName: user?.name,
      userAvatarUrl: user?.avatarUrl,
      userUsername: user?.username,
    } as Bet
  })
  const usersToRefreshMetrics = betUsers.filter((user) =>
    uniq(
      bets.filter((b) => b.shares !== 0 && !b.isApi).map((bet) => bet.userId)
    ).includes(user.id)
  )

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
  if (usersToRefreshMetrics.length > 0) {
    await updateUserContractMetrics(
      contract,
      uniqBy(usersToRefreshMetrics, 'id'),
      bets,
      pg
    )
    log(`Contract metrics updated for ${usersToRefreshMetrics.length} users.`)
  }
  debouncedContractUpdates(contract)

  await Promise.all(
    bets
      .filter((bet) => bet.replyToCommentId)
      .map(async (bet) => {
        const bettor = betUsers.find((user) => user.id === bet.userId)
        if (!bettor) return
        await handleBetReplyToComment(bet, contract, bettor, pg)
      })
  )

  const uniqueNonRedemptionBetsByUserId = uniqBy(
    bets.filter((bet) => !bet.isRedemption),
    'userId'
  )

  await Promise.all(
    uniqueNonRedemptionBetsByUserId
      .filter((bet) => bet.isApi || BOT_USERNAMES.includes(bet.userUsername))
      .map(async (bet) => {
        // assess flat fee for bots
        const userRef = firestore.doc(`users/${bet.userId}`)
        await userRef.update({
          balance: FieldValue.increment(-FLAT_TRADE_FEE),
          totalDeposits: FieldValue.increment(-FLAT_TRADE_FEE),
        })
      })
  )

  // NOTE: if place-multi-bet is added for any MULTIPLE_CHOICE question, this won't give multiple bonuses for every answer
  // as it only runs the following once per unique user. This is intentional behavior for NUMBER markets
  await Promise.all(
    uniqueNonRedemptionBetsByUserId
      .filter((bet) => !bet.isApi)
      .map(async (bet) => {
        const bettor = betUsers.find((user) => user.id === bet.userId)
        if (!bettor) return
        // Follow suggestion should be before betting streak update (which updates lastBetTime)
        !bettor.lastBetTime &&
          !bettor.referredByUserId &&
          (await createFollowSuggestionNotification(bettor.id, contract, pg))
        const eventId = originalBettor.id + '-' + bet.id
        await updateBettingStreak(bettor, bet, contract, eventId)
        const usersNonRedemptionBets = bets.filter(
          (b) => b.userId === bettor.id && !b.isRedemption
        )
        await giveUniqueBettorAndLiquidityBonus(
          contract,
          eventId,
          bettor,
          bet,
          usersNonRedemptionBets
        )

        await Promise.all([
          bet.amount >= 0 &&
            !bet.isSold &&
            addUserToContractFollowers(contract.id, bettor.id),

          updateUserInterestEmbedding(pg, bettor.id),

          addToLeagueIfNotInOne(pg, bettor.id),

          (bettor.lastBetTime ?? 0) < bet.createdTime &&
            firestore
              .doc(`users/${bettor.id}`)
              .update({ lastBetTime: bet.createdTime }),
        ])
      })
  )

  // New users in last month.
  if (originalBettor.createdTime > Date.now() - MONTH_MS) {
    const bet = normalBets[0]

    const otherBetToday = await pg.oneOrNone(
      `select bet_id from contract_bets
        where user_id = $1
          and DATE(created_time) = DATE($2)
          and bet_id != $3
          limit 1`,
      [
        originalBettor.id,
        new Date(normalBets[0].createdTime).toISOString(),
        bet.id,
      ]
    )
    if (!otherBetToday) {
      const numBetDays = await pg.one<number>(
        `with bet_days AS (
          SELECT DATE(contract_bets.created_time) AS bet_day
          FROM contract_bets
          where contract_bets.user_id = $1
          and contract_bets.created_time > $2
          GROUP BY DATE(contract_bets.created_time)
        )
        SELECT COUNT(bet_day) AS total_bet_days
        FROM bet_days`,
        [originalBettor.id, new Date(originalBettor.createdTime).toISOString()],
        (row) => Number(row.total_bet_days)
      )

      // Track unique days bet for users who have bet up to 10 days in the last 30 days.
      if (numBetDays <= 10) {
        console.log('Tracking unique days bet', numBetDays)
        await track(originalBettor.id, 'new user days bet', {
          numDays: numBetDays,
        })
      }
    }
  }
}

const debouncedContractUpdates = (contract: Contract) => {
  const writeUpdates = async () => {
    const pg = createSupabaseDirectClient()
    const { uniqueBettorCount } = contract
    const result = await pg.oneOrNone(
      `
        select
          (select sum(abs(amount)) from contract_bets where contract_id = $1) as volume,
          (select max(created_time) from contract_bets where contract_id = $1) as time,
          (select count(distinct user_id) from contract_bets where contract_id = $1) as count,

          (select sum((data->'fees'->>'creatorFee')::numeric) from contract_bets where contract_id = $1) as creator_fee,
          (select sum((data->'fees'->>'platformFee')::numeric) from contract_bets where contract_id = $1) as platform_fee,
          (select sum((data->'fees'->>'liquidityFee')::numeric) from contract_bets where contract_id = $1) as liquidity_fee
      `,
      [contract.id]
    )
    const {
      volume,
      time: lastBetTime,
      count,
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
      collectedFees,
    })

    await firestore.doc(`contracts/${contract.id}`).update(
      removeNullOrUndefinedProps({
        volume,
        lastBetTime: lastBetTime ? new Date(lastBetTime).valueOf() : undefined,
        lastUpdatedTime: Date.now(),
        uniqueBettorCount: uniqueBettorCount !== count ? count : undefined,
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

  const matchingLimitBetIds = filterDefined(
    bet.fills.map((fill) => fill.matchedBetId)
  )
  if (!matchingLimitBetIds.length) return

  const matchingLimitBets = filterDefined(
    await Promise.all(
      matchingLimitBetIds.map(
        async (matchedBetId) =>
          getDoc<LimitBet>(`contracts/${contract.id}/bets`, matchedBetId)
        // pg.map(
        //   `select data from contract_bets where bet_id = $1`,
        //   [fill.matchedBetId],
        //   (r) => r.data as LimitBet
        // )
      )
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
  recentBets: Bet[],
  pg: SupabaseDirectClient
) => {
  const metrics = await Promise.all(
    users.map(async (user) => {
      const bets = await pg.map(
        `select * from contract_bets where contract_id = $1 and user_id = $2`,
        [contract.id, user.id],
        convertBet
      )
      const recentBetsByUser = recentBets.filter(
        (bet) => bet.userId === user.id
      )
      // Handle possible replication delay
      bets.push(
        ...recentBetsByUser.filter((bet) => !bets.find((b) => b.id === bet.id))
      )
      return calculateUserMetrics(contract, bets, user)
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

  const db = createSupabaseClient()
  const comment = await getCommentSafe(db, bet.replyToCommentId)

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

const updateBettingStreak = async (
  user: User,
  bet: Bet,
  contract: Contract,
  eventId: string
) => {
  const ineligibleMessage = 'User has already bet after the reset time'
  const result = await firestore.runTransaction(async (trans) => {
    const userDoc = firestore.collection('users').doc(user.id)
    const bettor = (await trans.get(userDoc)).data() as User
    const betStreakResetTime = getBettingStreakResetTimeBeforeNow()
    const lastBetTime = bettor.lastBetTime ?? 0

    // If they've already bet after the reset time
    if (lastBetTime > betStreakResetTime)
      return {
        message: ineligibleMessage,
        status: 'error',
      }

    const newBettingStreak = (bettor?.currentBettingStreak ?? 0) + 1
    // Otherwise, add 1 to their betting streak
    trans.update(userDoc, {
      currentBettingStreak: newBettingStreak,
      lastBetTime: bet.createdTime,
    })
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
      toId: user.id,
      toType: 'USER',
      amount: bonusAmount,
      token: 'M$',
      category: 'BETTING_STREAK_BONUS',
      description: JSON.stringify(bonusTxnDetails),
      data: bonusTxnDetails,
    }
    const { message, txn, status } = await runTxnFromBank(trans, bonusTxn)
    return { message, txn, status, bonusAmount, newBettingStreak }
  })

  if (result.status != 'success' && result.message != ineligibleMessage) {
    log("betting streak bonus txn couldn't be made")
    log('status:', result.status)
    log('message:', result.message)
    return
  }
  if (result.txn) {
    await createBettingStreakBonusNotification(
      user,
      result.txn.id,
      bet,
      contract,
      result.bonusAmount,
      result.newBettingStreak,
      eventId
    )
  }
}

const giveUniqueBettorAndLiquidityBonus = async (
  contract: Contract,
  eventId: string,
  bettor: User,
  bet: Bet,
  usersNonRedemptionBets?: Bet[]
) => {
  const { answerId, isRedemption, isApi } = bet
  const pg = createSupabaseDirectClient()

  const isBot = BOT_USERNAMES.includes(bettor.username)
  const isUnlisted = contract.visibility === 'unlisted'
  const unSubsidized =
    contract.isSubsidized === undefined ? false : !contract.isSubsidized

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
    unSubsidized ||
    isUnfilledLimitOrder ||
    isApi
  )
    return

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

  // For bets with answerId (multiple choice), give a bonus for the first bet on each answer.
  // NOTE: this may miscount unique bettors if they place multiple bets quickly b/c of replication delay.
  const uniqueBettorIds = answerId
    ? await getUniqueBettorIdsForAnswer(contract.id, answerId, pg)
    : await getUniqueBettorIds(contract.id, pg)
  if (!uniqueBettorIds.includes(bettor.id)) uniqueBettorIds.push(bettor.id)

  // Check max bonus exceeded.
  if (uniqueBettorIds.length > MAX_TRADERS_FOR_BONUS) return

  // They may still have bet on this previously, use a transaction to be sure
  // we haven't sent creator a bonus already
  const uniqueBonusResult = await firestore.runTransaction(async (trans) => {
    const query = firestore
      .collection('txns')
      .where('fromType', '==', 'BANK')
      .where('toId', '==', creatorId)
      .where('category', '==', 'UNIQUE_BETTOR_BONUS')
      .where('data.uniqueNewBettorId', '==', bettor.id)
      .where('data.contractId', '==', contract.id)
    const queryWithMaybeAnswer = answerId
      ? query.where('data.answerId', '==', answerId)
      : query
    const txnsSnap = await queryWithMaybeAnswer.get()
    const bonusGivenAlready = txnsSnap.docs.length > 0
    if (bonusGivenAlready) return undefined

    const bonusAmount =
      uniqueBettorIds.length > MAX_TRADERS_FOR_BIG_BONUS
        ? SMALL_UNIQUE_BETTOR_BONUS_AMOUNT
        : contract.mechanism === 'cpmm-multi-1'
        ? UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT
        : UNIQUE_BETTOR_BONUS_AMOUNT

    const bonusTxnData = removeUndefinedProps({
      contractId: contract.id,
      uniqueNewBettorId: bettor.id,
      answerId,
      isPartner,
    })

    const bonusTxn: Omit<
      UniqueBettorBonusTxn,
      'id' | 'createdTime' | 'fromId'
    > = {
      fromType: 'BANK',
      toId: creatorId,
      toType: 'USER',
      amount: bonusAmount,
      token: 'M$',
      category: 'UNIQUE_BETTOR_BONUS',
      description: JSON.stringify(bonusTxnData),
      data: bonusTxnData,
    }

    return await runTxnFromBank(trans, bonusTxn)
  })

  if (!uniqueBonusResult) return

  if (uniqueBonusResult.status != 'success' || !uniqueBonusResult.txn) {
    log(
      `No bonus for user: ${contract.creatorId} - status:`,
      uniqueBonusResult.status
    )
    log('message:', uniqueBonusResult.message)
  } else {
    log(
      `Bonus txn for user: ${contract.creatorId} completed:`,
      uniqueBonusResult.txn?.id
    )

    await createUniqueBettorBonusNotification(
      creatorId,
      bettor,
      uniqueBonusResult.txn.id,
      contract,
      uniqueBonusResult.txn.amount,
      uniqueBettorIds,
      eventId + '-unique-bettor-bonus',
      bet,
      usersNonRedemptionBets,
      uniqueBonusResult.txn?.data?.isPartner
    )
  }

  const subsidy =
    uniqueBettorIds.length <= MAX_TRADERS_FOR_BIG_BONUS
      ? UNIQUE_BETTOR_LIQUIDITY
      : SMALL_UNIQUE_BETTOR_LIQUIDITY

  if (contract.mechanism === 'cpmm-1') {
    await addHouseSubsidy(contract.id, subsidy)
  } else if (contract.mechanism === 'cpmm-multi-1' && answerId) {
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
      await addHouseSubsidyToAnswer(contract.id, answerId, subsidy)
    }
  }
}
