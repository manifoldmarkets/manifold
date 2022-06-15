import { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { User } from 'common/user'
import {
  listenForGroup,
  listenForGroups,
  listenForFollow,
  listenForMemberGroups,
} from 'web/lib/firebase/groups'

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

export const useFollowingGroup = (
  group: Group,
  user: User | null | undefined
) => {
  const [following, setFollowing] = useState<boolean | undefined>()

  const groupId = group?.id
  const userId = user?.id

  useEffect(() => {
    if (userId) return listenForFollow(groupId, userId, setFollowing)
  }, [groupId, userId])

  return following
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
