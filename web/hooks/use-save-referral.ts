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

// An existing username is not the same shape as cleanUsername's output, which
// is why that helper is the wrong tool at both ends of this decode.
// create-user-main.ts and the onboarding flows both append randomString(4|5)
// — nanoid, whose alphabet includes '-' — to an already-25-character cleaned
// name, so real usernames run to 30 characters and can contain dashes.
const MAX_USERNAME_LENGTH = 25 + 5

// Sanitize the ?r= payload with base64's own alphabet (it is an encoding, not
// a name), then bound the decoded value the way a real username is bounded.
// Passing the ENCODED string to cleanUsername truncated it at 25 characters,
// so every referrer with a username of 19+ characters decoded to a mangled
// name that matched no user and was silently dropped; passing the DECODED
// name to it eats the '-' in a nanoid suffix, which breaks a referrer whose
// link works today.
const decodeBase64 = (base64: string) =>
  Buffer.from(base64.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64')
    .toString()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, MAX_USERNAME_LENGTH)
