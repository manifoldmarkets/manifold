import { cleanUsername } from 'common/util/clean-username'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { User, writeReferralInfo } from 'web/lib/firebase/users'

export const useSaveReferral = (
  user: User | null | undefined,
  options?: {
    defaultReferrerUsername?: string
    contractId?: string
  }
) => {
  const router = useRouter()

  useEffect(() => {
    const referrer = router.query.r
      ? decodeBase64(router.query.r as string)
      : (router.query.referrer as string)

    const referrerOrDefault = referrer || options?.defaultReferrerUsername

    if (user === null && router.isReady && referrerOrDefault) {
      writeReferralInfo(referrerOrDefault, {
        contractId: options?.contractId,
        explicitReferrer: referrer,
      })
    }
  }, [user, router, JSON.stringify(options)])
}

const decodeBase64 = (base64: string) => {
  return Buffer.from(cleanUsername(base64), 'base64').toString()
}
