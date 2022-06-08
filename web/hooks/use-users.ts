import { useState, useEffect } from 'react'
import { PrivateUser, User } from 'common/user'
import {
  getUser,
  listenForAllUsers,
  listenForPrivateUsers,
} from 'web/lib/firebase/users'
import { useUser } from './use-user'
import { groupBy, sortBy, difference } from 'lodash'
import { getContractsOfUserBets } from 'web/lib/firebase/bets'
import { useFollows } from './use-follows'

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    listenForAllUsers(setUsers)
  }, [])

  return users
}

export const useUserById = (userId?: string) => {
  const [user, setUser] = useState<User | undefined>(undefined)

  useEffect(() => {
    if (userId) {
      getUser(userId).then(setUser)
    }
  }, [userId])

  return user
}

export const usePrivateUsers = () => {
  const [users, setUsers] = useState<PrivateUser[]>([])

  useEffect(() => {
    listenForPrivateUsers(setUsers)
  }, [])

  return users
}

export const useDiscoverUsers = () => {
  const user = useUser()

  const [discoverUserIds, setDiscoverUserIds] = useState<string[]>([])

  useEffect(() => {
    if (user)
      getContractsOfUserBets(user.id).then((contracts) => {
        const creatorCounts = Object.entries(
          groupBy(contracts, 'creatorId')
        ).map(([id, contracts]) => [id, contracts.length] as const)

        const topCreatorIds = sortBy(creatorCounts, ([_, i]) => i)
          .map(([id]) => id)
          .reverse()

        setDiscoverUserIds(topCreatorIds)
      })
  }, [user])

  const followedUserIds = useFollows(user?.id)
  const nonSuggestions = [user?.id ?? '', ...(followedUserIds ?? [])]

  return difference(discoverUserIds, nonSuggestions).slice(0, 50)
}
