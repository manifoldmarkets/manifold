import { useAPIGetter } from './use-api-getter'
import { useUser } from './use-user'

export const usePersonalizedManaOffers = () => {
  const user = useUser()
  const { data, refresh } = useAPIGetter(
    'get-personalized-mana-offers',
    user ? {} : undefined
  )

  return {
    pendingCount: data?.pendingCount ?? 0,
    activeCount: data?.activeCount ?? 0,
    nextExpiresAt: data?.nextExpiresAt ?? null,
    nextRedeemableOfferId: data?.nextRedeemableOfferId ?? null,
    manaAmount: data?.manaAmount ?? 5000,
    priceUsdStripe: data?.priceUsdStripe ?? 40,
    priceUsdCrypto: data?.priceUsdCrypto ?? 35,
    refresh,
  }
}
