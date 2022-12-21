import { useState, useEffect } from 'react'
import { PrivateUser, User } from 'common/user'
import { groupBy, sortBy } from 'lodash'
import { getUserBetContracts } from 'web/lib/firebase/contracts'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { DocumentData } from 'firebase/firestore'
import { users, privateUsers } from 'web/lib/firebase/users'

export const useUsers = () => {
  const result = useFirestoreQueryData<DocumentData, User[]>(['users'], users, {
    subscribe: true,
    includeMetadataChanges: true,
  })
  return result.data ?? []
}

export const usePrivateUsers = () => {
  const result = useFirestoreQueryData<DocumentData, PrivateUser[]>(
    ['private users'],
    privateUsers,
    { subscribe: true, includeMetadataChanges: true }
  )
  return result.data || []
}

export const useDiscoverUsers = (userId: string | null | undefined) => {
  const [discoverUserIds, setDiscoverUserIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId)
      getUserBetContracts(userId).then((contracts) => {
        const creatorCounts = Object.entries(
          groupBy(contracts, 'creatorId')
        ).map(([id, contracts]) => [id, contracts.length] as const)

        const topCreatorIds = sortBy(creatorCounts, ([_, i]) => i)
          .map(([id]) => id)
          .reverse()

        setDiscoverUserIds(topCreatorIds)
      })
  }, [userId])

  return discoverUserIds
}
