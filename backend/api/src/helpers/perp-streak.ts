import { PerpContract } from 'common/contract'
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
//
// Serialized through betsQueue on the user id — the same per-user
// serialization the bet path gets — so two near-simultaneous trades (or a
// trade racing a bet) can't both observe streak_incremented and double-pay
// the daily bonus.
export const advancePerpBettingStreak = async (
  userId: string,
  contractId: string,
  isApi: boolean
) => {
  return betsQueue.enqueueFn(
    () => advancePerpBettingStreakInternal(userId, contractId, isApi),
    [userId]
  )
}

const advancePerpBettingStreakInternal = async (
  userId: string,
  contractId: string,
  isApi: boolean
) => {
  const pg = createSupabaseDirectClient()
  const user = await getUser(userId)
  if (!user) return
  const isFirstTradeEver = !user.lastBetTime

  const now = Date.now()
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

  if (isApi) return

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
