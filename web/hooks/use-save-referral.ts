import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { User, writeReferralInfo } from 'web/lib/firebase/users'

export const useSaveReferral = (
  user?: User | null,
  options?: {
    defaultReferrerUsername?: string
    contractId?: string
    groupId?: string
  }
) => {
  const router = useRouter()

  useEffect(() => {
    const { referrer } = router.query as {
      referrer?: string
    }

    const referrerOrDefault = referrer || options?.defaultReferrerUsername

    if (!user && router.isReady && referrerOrDefault) {
      writeReferralInfo(referrerOrDefault, {
        contractId: options?.contractId,
        explicitReferrer: referrer,
        groupId: options?.groupId,
      })
    }
  }, [user, router, JSON.stringify(options)])
}
