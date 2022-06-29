import { useEffect, useState } from 'react'
import { listenForReferrals } from 'web/lib/firebase/users'

export const useReferrals = (userId: string | null | undefined) => {
  const [referralIds, setReferralIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) return listenForReferrals(userId, setReferralIds)
  }, [userId])

  return referralIds
}
