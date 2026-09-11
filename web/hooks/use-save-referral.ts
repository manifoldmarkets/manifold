import { cleanUsername } from 'common/util/clean-username'
import { useEffect } from 'react'

import { User, writeReferralInfo } from 'web/lib/firebase/users'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'

export const useSaveReferral = (
  user: User | null | undefined,
  options?: {
    defaultReferrerUsername?: string
    contractId?: string
  }
) => {
  const { searchParams } = useDefinedSearchParams()

  useEffect(() => {
    const referrer = searchParams.get('r')
      ? decodeBase64(searchParams.get('r') as string)
      : (searchParams.get('referrer') as string)

    const referrerOrDefault = referrer || options?.defaultReferrerUsername

    if (user === null && referrerOrDefault) {
      writeReferralInfo(referrerOrDefault, {
        contractId: options?.contractId,
        explicitReferrer: referrer,
      })
    }
  }, [user, searchParams, JSON.stringify(options)])
}

// cleanUsername is for NAMES: it caps at 25 characters and strips everything
// outside [A-Za-z0-9_], including base64's own '+', '/' and '='. Running it
// over the still-ENCODED string truncated any payload longer than 25 chars,
// so every referrer whose username is 19+ characters decoded to a mangled
// name, matched no user, and had their referral silently dropped. Sanitize
// the base64 alphabet here; clean the name once it is actually a name.
const decodeBase64 = (base64: string) =>
  cleanUsername(
    Buffer.from(base64.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64').toString()
  )
