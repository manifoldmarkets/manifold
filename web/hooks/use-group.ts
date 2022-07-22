import { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { User } from 'common/user'
import {
  listenForGroup,
  listenForGroups,
  listenForMemberGroups,
  listGroups,
} from 'web/lib/firebase/groups'
import { getUser, getUsers } from 'web/lib/firebase/users'
import { filterDefined } from 'common/util/array'
import { Contract } from 'common/contract'
import { uniq } from 'lodash'

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

export const useMemberGroups = (
  userId: string | null | undefined,
  options?: { withChatEnabled: boolean },
  sort?: { by: 'mostRecentChatActivityTime' | 'mostRecentContractAddedTime' }
) => {
  const [memberGroups, setMemberGroups] = useState<Group[] | undefined>()
  useEffect(() => {
    if (userId)
      return listenForMemberGroups(
        userId,
        (groups) => {
          if (options?.withChatEnabled)
            return setMemberGroups(
              filterDefined(
                groups.filter((group) => group.chatDisabled !== true)
              )
            )
          return setMemberGroups(groups)
        },
        sort
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.withChatEnabled, sort?.by, userId])
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

export function useMembers(group: Group, max?: number) {
  const [members, setMembers] = useState<User[]>([])
  useEffect(() => {
    const { memberIds } = group
    if (memberIds.length > 0) {
      listMembers(group, max).then((members) => setMembers(members))
    }
  }, [group, max])
  return members
}

export async function listMembers(group: Group, max?: number) {
  const { memberIds } = group
  const numToRetrieve = max ?? memberIds.length
  if (memberIds.length === 0) return []
  if (numToRetrieve > 100)
    return (await getUsers()).filter((user) =>
      group.memberIds.includes(user.id)
    )
  return await Promise.all(group.memberIds.slice(0, numToRetrieve).map(getUser))
}

export const useGroupsWithContract = (contract: Contract) => {
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    if (contract.groupLinks)
      listGroups(uniq(contract.groupLinks.map((g) => g.slug))).then((groups) =>
        setGroups(filterDefined(groups))
      )
  }, [contract.groupLinks])

  return groups
}
