import {
  log,
  revalidateContractStaticProps,
  getContract,
  getUser,
  getUsers,
} from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract, isMultiCpmm } from 'common/contract'
import { User } from 'common/user'
import { groupBy, sortBy, sumBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import {
  createBetFillNotification,
  createBetReplyToCommentNotification,
  createBettingStreakBonusNotification,
  createFollowSuggestionNotification,
  createLimitBetCanceledNotification,
  createNewBettorNotification,
  createReferralNotification,
} from 'shared/create-notification'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import { getCommentSafe } from 'shared/supabase/contract-comments'
import { getBetsRepliedToComment } from 'shared/supabase/bets'
import { updateData } from 'shared/supabase/utils'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  MAX_TRADERS_FOR_BIG_BONUS,
  REFERRAL_BET_BONUS,
  SMALL_UNIQUE_BETTOR_LIQUIDITY,
  UNIQUE_BETTOR_LIQUIDITY,
} from 'common/economy'
import {
  BettingStreakBonusTxn,
  ReferralTxn,
  UniqueBettorBonusTxn,
} from 'common/txn'
import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
  roundTierBonus,
} from 'common/supporter-config'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'
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
    !originalBettor.lastBetTime &&
      originalBettor.referredByUserId &&
      (await payReferralBetBonus(originalBettor)),
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

// Pays the referrer the first-bet portion (REFERRAL_BET_BONUS) when the
// referred user places their very first bet. The remaining verify portion
// is paid in idenfy/callback.ts when the user completes ID verification.
const payReferralBetBonus = async (referredUser: User) => {
  const referrerId = referredUser.referredByUserId
  if (!referrerId) return
  if (referrerId === referredUser.id) {
    log(`Skipped referral first-bet bonus - self-referral for ${referredUser.id}`)
    return
  }

  const referrer = await getUser(referrerId)
  if (!referrer) return

  // SERIALIZABLE isolation + retry: protects the dedupe SELECT against
  // concurrent first-bet calls (e.g. two tabs, parallel API requests) that
  // would otherwise both miss the dedup and double-pay. Matches the pattern
  // used in refer-user.ts and runTransactionWithRetries.
  const result = await runTransactionWithRetries(async (tx) => {
    // Dedupe against any prior REFERRAL payout for this referred user:
    // - legacy single-payment txns (no bonusType) covered the full bonus
    // - explicit 'first_bet' txns from this code path
    const existing = await tx.oneOrNone(
      `SELECT 1 FROM txns WHERE to_id = $1
       AND category = 'REFERRAL'
       AND data->'data'->>'referredUserId' = $2
       AND (data->'data'->>'bonusType' IS NULL OR data->'data'->>'bonusType' = 'first_bet')`,
      [referrer.id, referredUser.id]
    )
    if (existing) return null

    // Referral multiplier comes from effective tier: unverified referrers
    // get a reduced 0.2x, verified gets 1x, subscribers higher.
    const entitlements = await getActiveSupporterEntitlements(tx, referrer.id)
    const referrerTier = resolveEffectiveTier({
      entitlements,
      bonusEligibility: referrer.bonusEligibility,
    })
    const referralMultiplier = getEffectiveBonusMultiplier(
      referrerTier,
      'referral'
    )
    const amount = roundTierBonus(REFERRAL_BET_BONUS * referralMultiplier)
    if (amount <= 0) {
      log(
        `Skipped referral first-bet bonus for referrer ${referrerId} - effective tier ${referrerTier} (multiplier ${referralMultiplier})`
      )
      return null
    }

    const bonusTxn: Omit<ReferralTxn, 'id' | 'createdTime' | 'fromId'> = {
      fromType: 'BANK',
      toId: referrer.id,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'REFERRAL',
      description: `Referral first-bet bonus for new user ${referredUser.id}: ${amount}`,
      data: {
        referredUserId: referredUser.id,
        referredContractId: referredUser.referredByContractId,
        bonusType: 'first_bet',
        effectiveTier: referrerTier,
        referralMultiplier,
        supporterBonus: referralMultiplier > 1,
      },
    }
    await runTxnFromBank(tx, bonusTxn)
    log(
      `Paid referral first-bet bonus of ${amount} to ${referrer.id} for ${referredUser.id}`
    )
    return amount
  })

  if (result) {
    await createReferralNotification(
      referrer.id,
      referredUser,
      result.toString(),
      undefined,
      'first_bet'
    )
  }
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

    // Fetch user's supporter entitlements for bonus multiplier
    const entitlements = await getActiveSupporterEntitlements(tx, oldUser.id)

    // Effective tier (verification + subscription) drives the streak multiplier.
    // Unverified users get 0.2x — the existing 5×streak / 25 cap naturally
    // becomes 1, 2, 3, 4, 5 / capped at 5 mana per day.
    const effectiveTier = resolveEffectiveTier({
      entitlements,
      bonusEligibility: oldUser.bonusEligibility,
    })
    const streakMultiplier = getEffectiveBonusMultiplier(
      effectiveTier,
      'streak'
    )

    // Send them the bonus times their streak, with effective-tier multiplier
    const baseBonus = Math.min(
      BETTING_STREAK_BONUS_AMOUNT * newBettingStreak,
      BETTING_STREAK_BONUS_MAX
    )
    const bonusAmount = roundTierBonus(baseBonus * streakMultiplier)

    if (bonusAmount <= 0) {
      return {
        bonusAmount: 0,
        sweepsBonusAmount: 0,
        newBettingStreak,
        txn: { id: bet.id },
        sweepsTxn: null,
        effectiveTier,
      }
    }

    const bonusTxnDetails = {
      currentBettingStreak: newBettingStreak,
      contractId: contract.id,
      effectiveTier,
      streakMultiplier,
      supporterBonus: streakMultiplier > 1,
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

    return { txn, bonusAmount, newBettingStreak, effectiveTier }
  })

  await createBettingStreakBonusNotification(
    oldUser,
    result.txn.id,
    bet,
    contract,
    result.bonusAmount,
    result.newBettingStreak,
    result.effectiveTier
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
  } else if (isMultiCpmm(contract) && bet.answerId) {
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
