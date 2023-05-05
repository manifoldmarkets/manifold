import { JSONContent } from '@tiptap/core'
import { Group } from 'common/group'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { groupRoleType } from 'web/components/groups/group-member-modal'
import { db } from 'web/lib/supabase/db'
import {
  getGroupFromSlug,
  getGroupMembers,
  getGroupOfRole,
  getMemberRole,
  MEMBER_LOAD_NUM,
} from 'web/lib/supabase/group'
import { getUser } from 'web/lib/supabase/user'
import { useAdmin } from './use-admin'
import { useIsAuthorized, useUser } from './use-user'
import { useSupabasePolling } from 'web/hooks/use-supabase'
import { getUserIsGroupMember } from 'web/lib/firebase/api'

export function useRealtimeRole(groupId: string | undefined) {
  const [userRole, setUserRole] = useState<groupRoleType | null | undefined>(
    undefined
  )
  const user = useUser()
  const isManifoldAdmin = useAdmin()
  useEffect(() => {
    if (user && groupId) {
      setTranslatedMemberRole(groupId, isManifoldAdmin, setUserRole, user)
    }
  }, [user, isManifoldAdmin, groupId])
  useEffect(() => {
    const channel = db.channel('user-group-role-realtime')
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'group_members',
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        if ((payload.new as any).member_id === user?.id) {
          setTranslatedMemberRole(groupId, isManifoldAdmin, setUserRole, user)
        }
      }
    )
    channel.subscribe(async (status) => {})
    return () => {
      db.removeChannel(channel)
    }
  }, [db, user])
  return userRole
}

export function usePollingGroupMemberIds(groupId: string) {
  const q = db.from('group_role').select('member_id').eq('group_id', groupId)
  return useSupabasePolling(q)
}

export function useRealtimeGroupMembers(
  groupId: string,
  hitBottom: boolean,
  numMembers: number | undefined
) {
  const [admins, setAdmins] = useState<JSONContent[] | undefined>(undefined)
  const [moderators, setModerators] = useState<JSONContent[] | undefined>(
    undefined
  )
  const [members, setMembers] = useState<JSONContent[] | undefined>(undefined)
  const [loadMore, setLoadMore] = useState<boolean>(false)
  const [offsetPage, setOffsetPage] = useState<number>(0)

  function loadMoreMembers() {
    setLoadMore(true)
    getGroupMembers(groupId, offsetPage + 1)
      .then((result) => {
        if (members) {
          const prevMembers = members
          setMembers([...prevMembers, ...result.data])
        } else {
          setMembers(result.data)
        }
        setOffsetPage((offsetPage) => offsetPage + 1)
      })
      .catch((e) => console.log(e))
      .finally(() => setLoadMore(false))
  }
  function fetchGroupMembers() {
    getGroupOfRole(groupId, 'admin')
      .then((result) => {
        const admins = result.data
        setAdmins(admins)
      })
      .catch((e) => console.log(e))

    getGroupOfRole(groupId, 'moderator')
      .then((result) => {
        const moderators = result.data
        setModerators(moderators)
      })
      .catch((e) => console.log(e))

    getGroupMembers(groupId, offsetPage, 0)
      .then((result) => {
        const members = result.data
        setMembers(members)
      })
      .catch((e) => console.log(e))
  }

  useEffect(() => {
    fetchGroupMembers()
  }, [])

  useEffect(() => {
    if (hitBottom && !loadMore && numMembers && numMembers > MEMBER_LOAD_NUM) {
      loadMoreMembers()
    }
  }, [hitBottom])

  useEffect(() => {
    const channel = db.channel('group-members-realtime')
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'group_members',
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        fetchGroupMembers()
      }
    )
    channel.subscribe(async (status) => {})
    return () => {
      db.removeChannel(channel)
    }
  }, [db])
  return { admins, moderators, members, loadMore }
}

export function useRealtimeNumGroupMembers(groupId: string) {
  const q = db
    .from('group_members')
    .select('*', { head: true, count: 'exact' })
    .eq('group_id', groupId)
  return useSupabasePolling(q)[0]?.count
}

export async function setTranslatedMemberRole(
  groupId: string | undefined,
  isManifoldAdmin: boolean,
  setRole: (role: groupRoleType | null) => void,
  user?: User | null
) {
  if (isManifoldAdmin) {
    setRole('admin')
  }
  if (user && groupId) {
    getMemberRole(user, groupId)
      .then((result) => {
        if (result.data.length > 0) {
          if (!result.data[0].role) {
            setRole('member')
          } else {
            setRole(result.data[0].role as groupRoleType)
          }
        } else {
          setRole(null)
        }
      })
      .catch((e) => console.log(e))
  } else {
    setRole(null)
  }
}

export function useGroupFromSlug(groupSlug: string) {
  const [group, setGroup] = useState<Group | null>(null)
  useEffect(() => {
    getGroupFromSlug(groupSlug, db)
      .then((result) => {
        setGroup(result)
      })
      .catch((e) => console.log(e))
  }, [groupSlug])

  return group
}

export function useGroupCreator(group?: Group | null) {
  const [creator, setCreator] = useState<User | null>(null)
  useEffect(() => {
    if (group && group.creatorId) {
      getUser(group.creatorId).then((result) => setCreator(result))
    }
  }, [group])
  return creator
}

export function useIsGroupMember(groupSlug: string) {
  const [isGroupMember, setIsGroupMember] = useState<boolean>(false)
  const isAuth = useIsAuthorized()
  useEffect(() => {
    if (isAuth) {
      getUserIsGroupMember({ groupSlug }).then((result) => {
        setIsGroupMember(result.isGroupMember)
      })
    }
  }, [isAuth])
  return isGroupMember
}
