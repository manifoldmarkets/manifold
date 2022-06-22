import { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { User } from 'common/user'
import {
  listenForGroup,
  listenForGroups,
  listenForMemberGroups,
} from 'web/lib/firebase/groups'
import { getUser } from 'web/lib/firebase/users'

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

export const useMemberGroups = (user: User | null | undefined) => {
  const [memberGroups, setMemberGroups] = useState<Group[] | undefined>()
  useEffect(() => {
    if (user) return listenForMemberGroups(user.id, setMemberGroups)
  }, [user])
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
    const { memberIds, creatorId } = group
    if (memberIds.length > 1)
      // get users via their user ids:
      Promise.all(
        memberIds.filter((mId) => mId !== creatorId).map(getUser)
      ).then((users) => {
        const members = users.filter((user) => user)
        setMembers(members)
      })
  }, [group])
  return members
}
