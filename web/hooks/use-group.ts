import { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { User } from 'common/user'
import {
  getGroup,
  getMemberGroups,
  GroupMemberDoc,
  groupMembers,
  listenForGroup,
  listenForGroupContractDocs,
  listenForGroups,
  listenForMemberGroupIds,
  listenForOpenGroups,
  listGroups,
  topFollowedGroupsQuery,
} from 'web/lib/firebase/groups'
import { getUser } from 'web/lib/firebase/users'
import { filterDefined } from 'common/util/array'
import { Contract } from 'common/contract'
import { keyBy, uniq, uniqBy } from 'lodash'
import { listenForValues } from 'web/lib/firebase/utils'
import { useQuery } from 'react-query'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { limit, query } from 'firebase/firestore'
import { useTrendingContracts } from './use-contracts'

export const useGroup = (groupId: string | undefined) => {
  const [group, setGroup] = useState<Group | null | undefined>()

  useEffect(() => {
    if (groupId) return listenForGroup(groupId, setGroup)
  }, [groupId])

  return group
}

export const useGroups = () => {
  const [groups, setGroups] = useState<Group[] | undefined>()

  useEffect(() => {
    return listenForGroups(setGroups)
  }, [])

  return groups
}

export const useOpenGroups = () => {
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    return listenForOpenGroups(setGroups)
  }, [])

  return groups
}

export const useTopFollowedGroups = (count: number) => {
  const result = useFirestoreQueryData(
    ['top-followed-contracts', count],
    query(topFollowedGroupsQuery, limit(count))
  )
  return result.data
}

export const useTrendingGroups = () => {
  const topGroups = useTopFollowedGroups(200)
  const groupsById = keyBy(topGroups, 'id')

  const trendingContracts = useTrendingContracts(200)

  const groupLinks = uniqBy(
    (trendingContracts ?? []).map((c) => c.groupLinks ?? []).flat(),
    (link) => link.groupId
  )

  return filterDefined(
    groupLinks.map((link) => groupsById[link.groupId])
  ).filter((group) => group.totalMembers >= 3)
}

export const useMemberGroups = (userId: string | null | undefined) => {
  const result = useQuery(['member-groups', userId ?? ''], () =>
    getMemberGroups(userId ?? '')
  )
  return result.data
}

export const useMemberGroupIds = (user: User | null | undefined) => {
  const cachedGroups = useMemberGroups(user?.id)

  const [memberGroupIds, setMemberGroupIds] = useState<string[] | undefined>(
    cachedGroups?.map((g) => g.id)
  )

  useEffect(() => {
    if (user) {
      return listenForMemberGroupIds(user.id, (groupIds) => {
        setMemberGroupIds(groupIds)
      })
    }
  }, [user])

  return memberGroupIds
}

export function useMemberGroupsSubscription(user: User | null | undefined) {
  const cachedGroups = useMemberGroups(user?.id)
  const [groups, setGroups] = useState(cachedGroups)

  const userId = user?.id
  useEffect(() => {
    if (userId) {
      return listenForMemberGroupIds(userId, (groupIds) => {
        Promise.all(groupIds.map((id) => getGroup(id))).then((groups) =>
          setGroups(filterDefined(groups))
        )
      })
    }
  }, [userId])

  return groups
}

export function useMembers(groupId: string | undefined) {
  const [members, setMembers] = useState<User[]>([])
  useEffect(() => {
    if (groupId)
      listenForValues<GroupMemberDoc>(groupMembers(groupId), (memDocs) => {
        const memberIds = memDocs.map((memDoc) => memDoc.userId)
        Promise.all(memberIds.map((id) => getUser(id))).then((users) => {
          setMembers(users)
        })
      })
  }, [groupId])
  return members
}

export function useMemberIds(groupId: string | null) {
  const [memberIds, setMemberIds] = useState<string[]>()
  useEffect(() => {
    if (groupId)
      return listenForValues<GroupMemberDoc>(groupMembers(groupId), (docs) => {
        setMemberIds(docs.map((doc) => doc.userId))
      })
  }, [groupId])
  return memberIds
}

export const useGroupsWithContract = (contract: Contract) => {
  const [groups, setGroups] = useState<Group[]>()

  useEffect(() => {
    if (contract.groupSlugs)
      listGroups(uniq(contract.groupSlugs)).then((groups) =>
        setGroups(filterDefined(groups))
      )
  }, [contract.groupSlugs])

  return groups
}

export function useGroupContractIds(groupId: string) {
  const [contractIds, setContractIds] = useState<string[]>([])

  useEffect(() => {
    if (groupId)
      return listenForGroupContractDocs(groupId, (docs) =>
        setContractIds(docs.map((doc) => doc.contractId))
      )
  }, [groupId])

  return contractIds
}
