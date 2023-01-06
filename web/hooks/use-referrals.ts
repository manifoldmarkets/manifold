import { useEffect, useState } from 'react'
import { SearchUserInfo } from 'web/lib/supabase/users'
import { getReferrals } from 'web/lib/supabase/referrals'

export const useReferrals = (userId: string) => {
  const [referredUsers, setReferredUsers] = useState<
    SearchUserInfo[] | undefined
  >()

  useEffect(() => {
    getReferrals(userId).then((referrals) => {
      setReferredUsers(referrals)
    })
  }, [userId])

  return referredUsers
}
