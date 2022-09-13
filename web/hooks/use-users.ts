import { useState, useEffect } from 'react'
import { PrivateUser, User } from 'common/user'
import { groupBy, sortBy, difference } from 'lodash'
import { getContractsOfUserBets } from 'web/lib/firebase/bets'
import { useFollows } from './use-follows'
import { useUser } from './use-user'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { DocumentData } from 'firebase/firestore'
import { users, privateUsers, getUsers } from 'web/lib/firebase/users'
import { QueryClient } from 'react-query'

export const useUsers = () => {
  const result = useFirestoreQueryData<DocumentData, User[]>(['users'], users, {
    subscribe: true,
    includeMetadataChanges: true,
  })
  return result.data ?? []
}

const q = new QueryClient()
export const getCachedUsers = async () =>
  q.fetchQuery(['users'], getUsers, { staleTime: Infinity })

export const usePrivateUsers = () => {
  const result = useFirestoreQueryData<DocumentData, PrivateUser[]>(
    ['private users'],
    privateUsers,
    { subscribe: true, includeMetadataChanges: true }
  )
  return result.data || []
}

export const useDiscoverUsers = (userId: string | null | undefined) => {
  const [discoverUserIds, setDiscoverUserIds] = useState<string[]>([])

  useEffect(() => {
    if (userId)
      getContractsOfUserBets(userId).then((contracts) => {
        const creatorCounts = Object.entries(
          groupBy(contracts, 'creatorId')
        ).map(([id, contracts]) => [id, contracts.length] as const)

        const topCreatorIds = sortBy(creatorCounts, ([_, i]) => i)
          .map(([id]) => id)
          .reverse()

        setDiscoverUserIds(topCreatorIds)
      })
  }, [userId])

  const user = useUser()
  const followedUserIds = useFollows(user?.id)
  const nonSuggestions = [user?.id ?? '', ...(followedUserIds ?? [])]

  return difference(discoverUserIds, nonSuggestions).slice(0, 50)
}
