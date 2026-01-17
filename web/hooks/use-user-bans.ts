import { useEffect, useState } from 'react'
import { UserBan } from 'common/user'
import { api } from 'web/lib/api/api'

export const useUserBans = (userId: string | undefined) => {
  const [bans, setBans] = useState<UserBan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setBans([])
      setLoading(false)
      return
    }

    setLoading(true)
    api('get-user-bans', { userId })
      .then((res) => setBans(res.bans as UserBan[]))
      .catch(() => setBans([]))
      .finally(() => setLoading(false))
  }, [userId])

  return { bans, loading }
}
