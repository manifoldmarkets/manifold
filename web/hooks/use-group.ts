import { useEffect, useState } from 'react'
import { Group, GroupMemberDoc } from 'common/group'
import { User } from 'common/user'
import {
  getGroup,
  getMemberGroups,
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
import { uniq } from 'lodash'
import { listenForValues } from 'web/lib/firebase/utils'
import { useQuery } from 'react-query'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { limit, query } from 'firebase/firestore'
import { storageStore, usePersistentState } from './use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { useStoreItems } from './use-store'
import { getUserIsGroupMember } from 'web/lib/firebase/api'
import { useIsAuthorized } from './use-user'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export const useGroup = (groupId: string | undefined) => {
  const [group, setGroup] = useState<Group | null | undefined>()

  useEffect(() => {
    if (groupId) return listenForGroup(groupId, setGroup)
  }, [groupId])

  return group
}

export const useAllGroups = () => {
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
  const [groups, setGroups] = usePersistentState<Group[] | undefined>(
    undefined,
    {
      key: 'member-groups',
      store: storageStore(safeLocalStorage),
    }
  )

  const userId = user?.id
  useEffect(() => {
    if (userId) {
      return listenForMemberGroupIds(userId, (groupIds) => {
        Promise.all(groupIds.map((id) => getGroup(id))).then((groups) =>
          setGroups(filterDefined(groups))
        )
      })
    }
  }, [setGroups, userId])

  return groups
}

export function useMemberGroupsIdsAndSlugs(userId: string | null | undefined) {
  const [groupIdsAndSlugs, setGroupIdsAndSlugs] = usePersistentState<
    { id: string; slug: string }[] | undefined
  >(undefined, {
    key: 'member-groups-ids-and-slugs',
    store: storageStore(safeLocalStorage),
  })

  useEffect(() => {
    if (userId) {
      return listenForMemberGroupIds(userId, (groupIds) => {
        Promise.all(groupIds.map((id) => getGroup(id))).then((groups) =>
          setGroupIdsAndSlugs(
            filterDefined(groups).map((g) => ({ id: g.id, slug: g.slug }))
          )
        )
      })
    }
  }, [setGroupIdsAndSlugs, userId])

  return groupIdsAndSlugs
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

export function useGroups(groupIds: string[]) {
  return useStoreItems(groupIds, listenForGroup, { loadOnce: true })
}

export function useIsGroupMember(groupSlug: string) {
  const [isMember, setIsMember] = usePersistentInMemoryState<any | undefined>(
    undefined,
    'is-member-' + groupSlug
  )
  const isAuthorized = useIsAuthorized()
  useEffect(() => {
    // if there is no user
    if (isAuthorized === false) {
      setIsMember(false)
    } else if (isAuthorized) {
      getUserIsGroupMember({ groupSlug: groupSlug }).then((result) => {
        setIsMember(result)
      })
    }
  }, [groupSlug, isAuthorized])
  return isMember
}
