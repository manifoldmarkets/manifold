import { PerpContract } from 'common/contract'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { payBettingStreak } from 'shared/betting-streak-bonus'
import { createFollowSuggestionNotification } from 'shared/create-notification'
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import { betsQueue } from 'shared/helpers/fn-queue'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { incrementStreakQuery } from 'shared/supabase/users'
import { getUser, log } from 'shared/utils'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'
import { payReferralBetBonus } from '../on-create-bet'

// Perp trades advance the prediction streak exactly like bets. Mirrors the
// place-bet pipeline: the increment runs for every user-initiated open and
// close (API trades included — place-bet runs incrementStreakQuery in-tx for
// all bets), while the streak bonus, league placement, and the
// first-ever-trade side effects (referral first-bet bonus, follow
// suggestion) run only for non-API trades — on-create-bet's
// nonRedemptionNonApiBets gate. Scheduler-driven exits (liquidation, ADL,
// resolution) never come through the API endpoints, so forced closes cannot
// advance a streak.
//
// Callers MUST skip this for idempotent replays (the engine returns
// replayed=true from its stored-event paths): a replay is not a trade, and
// calling this on one would advance the streak and pay the daily bonus for
// free — once per day, forever, off a single historical request.
export const advancePerpBettingStreak = async (
  userId: string,
  contractId: string,
  isApi: boolean,
  // The trade event's own timestamp. This runs after the engine transaction
  // commits, so Date.now() here can land in the next Pacific day and credit
  // the trade to a day it did not happen in.
  actionTime: number
) => {
  const pg = createSupabaseDirectClient()

  // Only the read-and-increment holds the betsQueue lock — the same per-user
  // serialization the bet path gets — so two near-simultaneous trades (or a
  // trade racing a bet) can't both observe streak_incremented and double-pay
  // the daily bonus. The payout must run AFTER the lock is released:
  // payBettingStreak -> runTxnFromBank re-enters betsQueue on the same user
  // id, so holding the lock across it deadlocks until the queue timeout and
  // the bonus txn rolls back, while the already-committed increment survives
  // and silently consumes the user's streak day.
  const increment = await betsQueue.enqueueFn(
    () => incrementStreak(userId, actionTime),
    [userId]
  )
  if (!increment || isApi) return
  const { user, isFirstTradeEver, streakIncremented } = increment

  const needsContract = (streakIncremented || isFirstTradeEver) && contractId
  const contract = needsContract
    ? (
        await pg.oneOrNone<{ data: PerpContract }>(
          `select data from contracts where id = $1`,
          [contractId]
        )
      )?.data
    : undefined

  if (isFirstTradeEver && contract) {
    try {
      await createFollowSuggestionNotification(user.id, contract, pg)
      if (user.referredByUserId) await payReferralBetBonus(user)
    } catch (err) {
      log.error(`perp first-trade side effects failed for ${user.id}: ${err}`)
    }
  }

  if (streakIncremented && contract) {
    await payBettingStreak(
      user,
      contract,
      `/${contract.creatorUsername}/${contract.slug}`,
      contract.id
    )
  }

  await addToLeagueIfNotInOne(pg, user.id)
}

const incrementStreak = async (
  userId: string,
  now: number
): Promise<
  | { user: User; isFirstTradeEver: boolean; streakIncremented: boolean }
  | undefined
> => {
  const pg = createSupabaseDirectClient()
  const user = await getUser(userId)
  if (!user) return undefined
  const isFirstTradeEver = !user.lastBetTime

  const rows = await pg.any<{ streak_incremented: boolean }>(
    incrementStreakQuery(user, now)
  )
  const streakIncremented = rows[0]?.streak_incremented === true

  broadcastUpdatedUser(
    removeUndefinedProps({
      id: user.id,
      currentBettingStreak: streakIncremented
        ? (user.currentBettingStreak ?? 0) + 1
        : undefined,
      lastBetTime: now,
    })
  )

  return { user, isFirstTradeEver, streakIncremented }
}
