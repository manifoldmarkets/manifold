import { useEffect, useRef, useState } from 'react'
import { useAPIGetter } from './use-api-getter'
import { useUser } from './use-user'
import { api } from 'web/lib/api/api'

// Cross-instance refresh fan-out. Multiple components mount this hook
// simultaneously — typically the AddFundsButton's badge in the sidebar AND
// the offer card on /checkout. Each instance has its own React state, so a
// dismiss/un-dismiss from /checkout doesn't automatically propagate to the
// badge unless we explicitly tell every instance to refetch. Without this,
// users see the card collapse while the OFFER badge lingers for a beat —
// makes the cause-and-effect of the click feel broken.
const refreshSubscribers = new Set<() => void>()
const notifyAllOfferHooks = () => {
  for (const s of refreshSubscribers) s()
}

export const usePersonalizedManaOffers = () => {
  const user = useUser()
  const { data, refresh } = useAPIGetter(
    'get-personalized-mana-offers',
    user ? {} : undefined
  )

  // `refresh` is a fresh closure each render. Hold the latest in a ref so the
  // stable subscriber always invokes the current one without re-registering
  // on every render.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    const callback = () => {
      refreshRef.current()
    }
    refreshSubscribers.add(callback)
    return () => {
      refreshSubscribers.delete(callback)
    }
  }, [])

  const [dismissPending, setDismissPending] = useState(false)

  const setDismissed = async (dismissed: boolean) => {
    if (dismissPending) return
    setDismissPending(true)
    try {
      await api('dismiss-personalized-mana-offer', { dismissed })
      // Fan out: every mounted hook instance refetches. useAPIGetter's
      // in-flight promise cache de-dupes simultaneous calls, but each
      // instance still needs to be told to update its local state.
      notifyAllOfferHooks()
    } finally {
      setDismissPending(false)
    }
  }

  return {
    pendingCount: data?.pendingCount ?? 0,
    activeCount: data?.activeCount ?? 0,
    dismissedCount: data?.dismissedCount ?? 0,
    nextExpiresAt: data?.nextExpiresAt ?? null,
    nextRedeemableOfferId: data?.nextRedeemableOfferId ?? null,
    dismissedNextExpiresAt: data?.dismissedNextExpiresAt ?? null,
    dismissedNextRedeemableOfferId:
      data?.dismissedNextRedeemableOfferId ?? null,
    manaAmount: data?.manaAmount ?? 5000,
    priceUsdStripe: data?.priceUsdStripe ?? 40,
    priceUsdCrypto: data?.priceUsdCrypto ?? 35,
    refresh,
    setDismissed,
    dismissPending,
  }
}
