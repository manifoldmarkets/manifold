import { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { User } from 'common/user'
import {
  getGroupBySlug,
  getGroupsWithContractId,
  listenForGroup,
  listenForGroups,
  listenForMemberGroups,
} from 'web/lib/firebase/groups'
import { getUser } from 'web/lib/firebase/users'
import { CATEGORIES, CATEGORIES_GROUP_SLUG_POSTFIX } from 'common/categories'
import { filterDefined } from 'common/util/array'

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

export const useDefaultGroups = () => {
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    const slugs = Object.values(CATEGORIES).map(
      (category) => category + CATEGORIES_GROUP_SLUG_POSTFIX
    )
    Promise.all(slugs.map((slug) => getGroupBySlug(slug))).then((groups) => {
      setGroups(filterDefined(groups))
    })
  }, [])

  return groups
}

export const useMemberGroups = (
  userId: string | null | undefined,
  options?: { withChatEnabled: boolean }
) => {
  const [memberGroups, setMemberGroups] = useState<Group[] | undefined>()
  useEffect(() => {
    if (userId)
      return listenForMemberGroups(userId, (groups) => {
        if (options?.withChatEnabled)
          return setMemberGroups(
            filterDefined(groups.filter((group) => group.chatDisabled !== true))
          )
        return setMemberGroups(groups)
      })
  }, [options?.withChatEnabled, userId])
  return memberGroups
}

// Note: We cache member group ids in localstorage to speed up the initial load
export const useMemberGroupIds = (user: User | null | undefined) => {
  const [memberGroupIds, setMemberGroupIds] = useState<string[] | undefined>(
    undefined
  )

  useEffect(() => {
    if (user) {
      const key = `member-groups-${user.id}`
      const memberGroupJson = localStorage.getItem(key)
      if (memberGroupJson) {
        setMemberGroupIds(JSON.parse(memberGroupJson))
      }

      return listenForMemberGroups(user.id, (Groups) => {
        const groupIds = Groups.map((group) => group.id)
        setMemberGroupIds(groupIds)
        localStorage.setItem(key, JSON.stringify(groupIds))
      })
    }
  }, [user])

  return memberGroupIds
}

export function useMembers(group: Group) {
  const [members, setMembers] = useState<User[]>([])
  useEffect(() => {
    const { memberIds } = group
    if (memberIds.length > 0) {
      listMembers(group).then((members) => setMembers(members))
    }
  }, [group])
  return members
}

export async function listMembers(group: Group) {
  return await Promise.all(group.memberIds.map(getUser))
}

export const useGroupsWithContract = (contractId: string | undefined) => {
  const [groups, setGroups] = useState<Group[] | null | undefined>()

  useEffect(() => {
    if (contractId) getGroupsWithContractId(contractId, setGroups)
  }, [contractId])

  return groups
}
