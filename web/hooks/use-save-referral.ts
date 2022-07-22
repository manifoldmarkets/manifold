import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { User, writeReferralInfo } from 'web/lib/firebase/users'

export const useSaveReferral = (
  user?: User | null,
  options?: {
    defaultReferrer?: string
    contractId?: string
    groupId?: string
  }
) => {
  const router = useRouter()

  useEffect(() => {
    const { referrer } = router.query as {
      referrer?: string
    }

    const actualReferrer = referrer || options?.defaultReferrer

    if (!user && router.isReady && actualReferrer) {
      writeReferralInfo(actualReferrer, options?.contractId, options?.groupId)
    }
  }, [user, router, options])
}
