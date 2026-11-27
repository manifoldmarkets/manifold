import { useMemo } from 'react'

import { resolveEffectiveTier } from 'common/supporter-config'
import {
  TrophyPrizeAccount,
  getTrophyPrizeStanding,
  isStarterTrophyAccount,
} from 'common/trophies'
import { useUser } from 'web/hooks/use-user'

/**
 * What the signed-in account collects of a trophy prize: claim-trophy applies
 * the same rules. Undefined when signed out, and for bots, which get none.
 */
export function useTrophyPrizeAccount(): TrophyPrizeAccount | undefined {
  const user = useUser()
  const isBot = !user || !!user.isBot
  const createdTime = user?.createdTime
  const entitlements = user?.entitlements
  const bonusEligibility = user?.bonusEligibility
  return useMemo(
    () =>
      isBot || createdTime === undefined
        ? undefined
        : {
            isStarterAccount: isStarterTrophyAccount(createdTime),
            standing: getTrophyPrizeStanding(
              resolveEffectiveTier({ entitlements, bonusEligibility })
            ),
          },
    [isBot, createdTime, entitlements, bonusEligibility]
  )
}

/** Whether the account's standing lets it collect anything at all. */
export const collectsTrophyPrizes = (account: TrophyPrizeAccount | undefined) =>
  !!account &&
  (account.standing.manaMultiplier > 0 ||
    account.standing.freezes ||
    account.standing.membership)
