import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
} from 'common/supporter-config'
import { isStarterTrophyAccount } from 'common/trophies'
import { useUser } from 'web/hooks/use-user'

export function useTrophyRewardMultiplier() {
  const user = useUser()
  if (!user || user.isBot || !isStarterTrophyAccount(user.createdTime)) return 0
  const { entitlements, bonusEligibility } = user
  return getEffectiveBonusMultiplier(
    resolveEffectiveTier({ entitlements, bonusEligibility }),
    'quest'
  )
}
