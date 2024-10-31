import { log, getUsers, revalidateContractStaticProps } from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
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
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { convertBet } from 'common/supabase/bets'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import { getCommentSafe } from 'shared/supabase/contract-comments'
import { getBetsDirect, getBetsRepliedToComment } from 'shared/supabase/bets'
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
import { BettingStreakBonusTxn, UniqueBettorBonusTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { Answer } from 'common/answer'
import {
  addHouseSubsidy,
  addHouseSubsidyToAnswer,
} from 'shared/helpers/add-house-subsidy'
import { debounce } from 'api/helpers/debounce'
import {
  broadcastNewBets,
  broadcastOrders,
  broadcastUpdatedAnswers,
  broadcastUpdatedContract,
  broadcastUpdatedMetrics,
  broadcastUpdatedUser,
} from 'shared/websockets/helpers'
import { followContractInternal } from 'api/follow-contract'
import { getContractMetrics } from 'shared/helpers/user-contract-metrics'
import { removeUndefinedProps } from 'common/util/object'
import { executeNewBetResult } from './place-bet'
import { broadcastUserUpdates } from 'shared/supabase/users'

type ExecuteNewBetResult = Omit<
  Awaited<ReturnType<typeof executeNewBetResult>>,
  'betId' | 'betGroupId' | 'newBet'
> & {
  reloadMetrics?: boolean
}

export const onCreateBets = async (result: ExecuteNewBetResult) => {
  const {
    fullBets: bets,
    contract,
    user: originalBettor,
    cancelledLimitOrders,
    makers,
    streakIncremented,
    bonusTxn: creatorBonusTxn,
    reloadMetrics,
    userUpdates,
    contractUpdate,
    answerUpdates,
  } = result

  const pg = createSupabaseDirectClient()
  const startNewBets = Date.now()
  broadcastNewBets(contract.id, contract.visibility, bets)
  log(`Broadcasting new bets took ${Date.now() - startNewBets}ms`)
  if (userUpdates) {
    const startUserUpdates = Date.now()
    broadcastUserUpdates(userUpdates)
    log(`Broadcasting user updates took ${Date.now() - startUserUpdates}ms`)
  }
  if (contractUpdate) {
    const startContractUpdate = Date.now()
    broadcastUpdatedContract(contract.visibility, contractUpdate)
    log(
      `Broadcasting contract update took ${Date.now() - startContractUpdate}ms`
    )
  }
  if (answerUpdates) {
    const startAnswerUpdates = Date.now()
    broadcastUpdatedAnswers(contract.id, answerUpdates)
    log(`Broadcasting answer updates took ${Date.now() - startAnswerUpdates}ms`)
  }
  if (cancelledLimitOrders) {
    const startCancelOrders = Date.now()
    broadcastOrders(cancelledLimitOrders)
    log(
      `Broadcasting cancelled orders took ${Date.now() - startCancelOrders}ms`
    )
    const startNotifications = Date.now()
    await Promise.all(
      cancelledLimitOrders.map((order) => {
        createLimitBetCanceledNotification(
          originalBettor,
          order.userId,
          order,
          makers?.find((m) => m.bet.id === order.id)?.amount ?? 0,
          contract
        )
      })
    )
    log(
      `Creating limit order cancel notifications took ${
        Date.now() - startNotifications
      }ms`
    )
  }
  broadcastUpdatedUser(
    removeUndefinedProps({
      id: originalBettor.id,
      currentBettingStreak: streakIncremented
        ? (originalBettor?.currentBettingStreak ?? 0) + 1
        : undefined,
      lastBetTime: bets[0].createdTime,
    })
  )
  const updatedMetrics = reloadMetrics
    ? await getContractMetrics(pg, [originalBettor.id], contract.id, [], true)
    : result.updatedMetrics
  broadcastUpdatedMetrics(updatedMetrics)
  debounceRevalidateContractStaticProps(contract)
  const matchedBetIds = filterDefined(
    bets.flatMap((b) => b.fills?.map((f) => f.matchedBetId) ?? [])
  )
  if (matchedBetIds.length > 0) {
    const updatedLimitBets = (await getBetsDirect(
      pg,
      matchedBetIds
    )) as LimitBet[]
    broadcastOrders(updatedLimitBets)
  }

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
    creatorBonusTxn &&
      followContractInternal(pg, contract.id, true, originalBettor.id),
    creatorBonusTxn &&
      sendUniqueBettorNotificationToCreator(
        contract,
        originalBettor,
        earliestBet,
        creatorBonusTxn,
        nonRedemptionNonApiBets
      ),
    addToLeagueIfNotInOne(pg, originalBettor.id),
  ])
}

const debounceRevalidateContractStaticProps = (contract: Contract) => {
  const writeUpdates = async () => {
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
  txn: UniqueBettorBonusTxn,
  usersNonRedemptionBets?: Bet[]
) => {
  const { answerId } = bet

  const answer =
    answerId && 'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id == answerId)
      : undefined
  const answerCreatorId = answer?.userId
  const creatorId = answerCreatorId ?? contract.creatorId

  await createNewBettorNotification(
    creatorId,
    bettor,
    contract,
    bet,
    txn,
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
