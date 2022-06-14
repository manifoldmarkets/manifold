import { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { User } from 'common/user'
import {
  listenForGroup,
  listenForGroups,
  listenForGroupsWithTags,
  listenForFollow,
  listenForFollowedGroups,
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

export const useGroupsWithTags = (tags: string[] | undefined) => {
  const [groups, setGroups] = useState<Group[] | undefined>()

  const tagsKey = tags?.join(',')

  useEffect(() => {
    if (tags && tags.length > 0) return listenForGroupsWithTags(tags, setGroups)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsKey])

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

// Note: We cache followedFoldIds in localstorage to speed up the initial load
export const useFollowedGroupIds = (user: User | null | undefined) => {
  const [followedGroupIds, setFollowedGroupIds] = useState<
    string[] | undefined
  >(undefined)

  useEffect(() => {
    if (user) {
      const key = `followed-groups-${user.id}`
      const followedGroupJson = localStorage.getItem(key)
      if (followedGroupJson) {
        setFollowedGroupIds(JSON.parse(followedGroupJson))
      }

      return listenForFollowedGroups(user.id, (GroupIds) => {
        setFollowedGroupIds(GroupIds)
        localStorage.setItem(key, JSON.stringify(GroupIds))
      })
    }
  }, [user])

  return followedGroupIds
}
