import { useMemo } from 'react'

import { BANNED_TRADING_USER_IDS } from 'common/envs/constants'
import { getUserSupporterTier } from 'common/supporter-config'
import {
  TrophyPrizeAccount,
  getPaidEntitlements,
  getTrophyPrizeStanding,
  isStarterTrophyAccount,
  resolveTrophyPrizeTier,
} from 'common/trophies'
import { useUser } from 'web/hooks/use-user'

/**
 * What the signed-in account collects of a trophy prize: claim-trophy applies
 * the same rules. Undefined when signed out, and for the accounts that get no
 * prizes: bots, and those on the old trading ban list.
 */
export function useTrophyPrizeAccount(): TrophyPrizeAccount | undefined {
  const user = useUser()
  const getsNoPrizes =
    !user || !!user.isBot || BANNED_TRADING_USER_IDS.includes(user.id)
  const createdTime = user?.createdTime
  const entitlements = user?.entitlements
  const bonusEligibility = user?.bonusEligibility
  return useMemo(
    () =>
      getsNoPrizes || createdTime === undefined
        ? undefined
        : {
            isStarterAccount: isStarterTrophyAccount(createdTime),
            standing: getTrophyPrizeStanding(
              resolveTrophyPrizeTier({
                entitlements,
                bonusEligibility,
                // A paid membership set aside while free days run isn't
                // public. The server counts it; the page can't.
                hasPaidMembership: !!getUserSupporterTier(
                  getPaidEntitlements(entitlements)
                ),
              })
            ),
          },
    [getsNoPrizes, createdTime, entitlements, bonusEligibility]
  )
}

/** Whether the account's standing lets it collect anything at all. */
export const collectsTrophyPrizes = (account: TrophyPrizeAccount | undefined) =>
  !!account &&
  (account.standing.manaMultiplier > 0 ||
    account.standing.freezes ||
    account.standing.membership)
