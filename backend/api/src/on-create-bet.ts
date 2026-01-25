import {
  log,
  revalidateContractStaticProps,
  getContract,
  getUsers,
} from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { canReceiveBonuses, User } from 'common/user'
import { groupBy, sortBy, sumBy } from 'lodash'
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
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import { getCommentSafe } from 'shared/supabase/contract-comments'
import { getBetsRepliedToComment } from 'shared/supabase/bets'
import { updateData } from 'shared/supabase/utils'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  MAX_TRADERS_FOR_BIG_BONUS,
  SMALL_UNIQUE_BETTOR_LIQUIDITY,
  UNIQUE_BETTOR_LIQUIDITY,
} from 'common/economy'
import { BettingStreakBonusTxn, UniqueBettorBonusTxn } from 'common/txn'
import { getBenefit, SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'
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
    updatedMakers,
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
  broadcastUpdatedUser(
    removeUndefinedProps({
      id: originalBettor.id,
      currentBettingStreak: streakIncremented
        ? (originalBettor?.currentBettingStreak ?? 0) + 1
        : undefined,
      lastBetTime: bets[0].createdTime,
    })
  )
  if (updatedMakers.length) {
    broadcastOrders(updatedMakers as LimitBet[])
  }
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
      cancelledLimitOrders
        .filter((order) => !order.silent)
        .map((order) => {
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
  const updatedMetrics = reloadMetrics
    ? await getContractMetrics(pg, [originalBettor.id], contract.id, [], true)
    : result.updatedMetrics
  broadcastUpdatedMetrics(updatedMetrics)
  debounceRevalidateContractStaticProps(contract)
  const makersToNotify = updatedMakers.filter((m) => !m.silent)
  if (makersToNotify.length) {
    const makerUsers = await getUsers(makersToNotify.map((m) => m.userId))
    await Promise.all(
      makersToNotify.map(async (updatedMaker) => {
        const bet = bets.find((b) =>
          b.fills?.some((f) => f.matchedBetId === updatedMaker.id)
        )
        if (!bet) {
          log.error(`No bet found for updated maker ${updatedMaker.id}`)
          return
        }
        if (!bet.fills?.length) return
        const limitOrderer = makerUsers.find(
          (u) => u.id === updatedMaker.userId
        )
        if (!limitOrderer) return
        await createBetFillNotification(
          limitOrderer,
          originalBettor,
          bet,
          updatedMaker,
          contract
        )
      })
    )
  }

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

const handleBetReplyToComment = async (
  bet: Bet,
  contract: Contract,
  bettor: User,
  pg: SupabaseDirectClient
) => {
  if (!bet.replyToCommentId) return

  const comment = await getCommentSafe(pg, bet.replyToCommentId)

  if (!comment) return

  const manaContract =
    contract.token === 'CASH'
      ? await getContract(pg, contract.siblingContractId!)
      : contract

  if (!manaContract) return

  const allBetReplies = await getBetsRepliedToComment(
    pg,
    comment,
    contract.id,
    contract.siblingContractId
  )

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
    // Only pay betting streak bonus if user can receive bonuses (verified or grandfathered)
    if (!canReceiveBonuses(oldUser)) {
      return {
        bonusAmount: 0,
        sweepsBonusAmount: 0,
        newBettingStreak,
        txn: { id: bet.id },
        sweepsTxn: null,
      }
    }

    // Fetch user's supporter entitlements for bonus multiplier
    const supporterEntitlementRows = await tx.manyOrNone(
      `SELECT user_id, entitlement_id, granted_time, expires_time, enabled FROM user_entitlements
       WHERE user_id = $1
       AND entitlement_id = ANY($2)
       AND enabled = true
       AND (expires_time IS NULL OR expires_time > NOW())`,
      [oldUser.id, SUPPORTER_ENTITLEMENT_IDS]
    )

    // Convert to UserEntitlement format for getBenefit
    const entitlements = supporterEntitlementRows.map(convertEntitlement)

    // Get tier-specific quest multiplier (1x for non-supporters)
    const questMultiplier = getBenefit(entitlements, 'questMultiplier')

    // Send them the bonus times their streak, with supporter multiplier
    const baseBonus = Math.min(
      BETTING_STREAK_BONUS_AMOUNT * newBettingStreak,
      BETTING_STREAK_BONUS_MAX
    )
    const bonusAmount = Math.floor(baseBonus * questMultiplier)

    const bonusTxnDetails = {
      currentBettingStreak: newBettingStreak,
      contractId: contract.id,
      supporterBonus: questMultiplier > 1,
      questMultiplier,
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

    return { txn, bonusAmount, newBettingStreak }
  })

  await createBettingStreakBonusNotification(
    oldUser,
    result.txn.id,
    bet,
    contract,
    result.bonusAmount,
    result.newBettingStreak
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
