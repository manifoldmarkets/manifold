import { useState, useEffect } from 'react'
import { PrivateUser, User } from 'common/user'
import {
  listenForAllUsers,
  listenForPrivateUsers,
} from 'web/lib/firebase/users'
import { groupBy, sortBy, difference } from 'lodash'
import { getContractsOfUserBets } from 'web/lib/firebase/bets'
import { useFollows } from './use-follows'
import { useUser } from './use-user'

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    listenForAllUsers(setUsers)
  }, [])

  return users
}

export const usePrivateUsers = () => {
  const [users, setUsers] = useState<PrivateUser[]>([])

  useEffect(() => {
    listenForPrivateUsers(setUsers)
  }, [])

  return users
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
