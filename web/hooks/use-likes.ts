import { useEffect, useState } from 'react'
import { listenForLikes } from 'web/lib/firebase/users'
import { Like } from 'common/like'

export const useUserLikes = (userId: string | undefined) => {
  const [contractIds, setContractIds] = useState<Like[] | undefined>()

  useEffect(() => {
    if (userId) return listenForLikes(userId, setContractIds)
  }, [userId])

  return contractIds
}
