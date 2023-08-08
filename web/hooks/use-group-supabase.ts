import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { groupRoleType } from 'web/components/groups/group-member-modal'
import { useSupabasePolling } from 'web/hooks/use-supabase-polling'
import { getUserIsGroupMember } from 'web/lib/firebase/api'
import { db } from 'web/lib/supabase/db'
import {
  getGroupFromSlug,
  getGroupMembers,
  getGroupOfRole,
  getMemberRole,
  MEMBER_LOAD_NUM,
} from 'web/lib/supabase/group'
import {
  getGroupsWhereUserHasRole,
  getMyGroupRoles,
  listGroupsBySlug,
} from 'web/lib/supabase/groups'
import { useRealtimeChannel } from 'web/lib/supabase/realtime/use-realtime'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useAdmin } from './use-admin'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useIsAuthorized, useUser } from './use-user'
import { Row } from 'common/supabase/utils'
import { convertGroup } from 'common/supabase/groups'

export function useIsGroupMember(groupSlug: string) {
  const [isMember, setIsMember] = usePersistentInMemoryState<
    boolean | undefined
  >(undefined, 'is-member-' + groupSlug)
  const isAuthorized = useIsAuthorized()
  useEffect(() => {
    // if there is no user
    if (isAuthorized === false) {
      setIsMember(false)
    } else if (isAuthorized) {
      getUserIsGroupMember({ groupSlug: groupSlug }).then((result) => {
        setIsMember(result.isGroupMember)
      })
    }
  }, [groupSlug, isAuthorized])
  return isMember
}

export function useMemberGroupIds(
  userId: string | undefined | null
): string[] | undefined {
  const [groupIds, setGroupIds] = useState<string[] | undefined>(undefined)
  useEffect(() => {
    db.from('group_members')
      .select('group_id')
      .eq('member_id', userId)
      .then((result) => {
        if (result) {
          const groupIds = (result as any).data.map((row: any) => row.group_id)
          setGroupIds(groupIds)
        }
      })
  }, [userId])
  return groupIds
}

export function useRealtimeMemberGroupIds(
  userId: string | undefined | null
): string[] | undefined {
  const { rows } = useSubscription('group_members', {
    k: 'member_id',
    v: userId ?? '_',
  })
  return rows?.map((row) => row.group_id) ?? undefined
}

export function useRealtimeGroupContractIds(groupId: string) {
  const { rows } = useSubscription('group_contracts', {
    k: 'group_id',
    v: groupId,
  })
  return rows?.map((r) => r.contract_id)
}

export const useGroupsWithContract = (
  contract: Contract | undefined | null
) => {
  const [groups, setGroups] = useState<Group[] | undefined>()
  const groupIds = useSubscription('group_contracts', {
    k: 'contract_id',
    v: contract?.id ?? '_',
  }).rows?.map((r) => r.group_id)
  useEffect(() => {
    if (groupIds) {
      db.from('groups')
        .select('*')
        .in('id', groupIds)
        .then((result) => {
          setGroups(result.data?.map(convertGroup))
        })
    }
  }, [groupIds?.length])
  return groups
}

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

  const channelFilter = { k: 'group_id', v: groupId ?? '_' } as const
  useRealtimeChannel('*', 'group_members', channelFilter, (change) => {
    if ((change.new as any).member_id === user?.id) {
      setTranslatedMemberRole(groupId, isManifoldAdmin, setUserRole, user)
    }
  })

  return userRole
}

export function useRealtimeGroupMemberIds(groupId: string) {
  const { rows } = useSubscription('group_members', {
    k: 'group_id',
    v: groupId,
  })
  return rows?.map((row) => row.member_id) ?? []
}

export type Member = Row<'group_role'>

export function useRealtimeGroupMembers(
  group: Group,
  hitBottom: boolean,
  numMembers: number | undefined
) {
  const { id: groupId } = group
  const [admins, setAdmins] = useState<Member[] | undefined>(undefined)
  const [moderators, setModerators] = useState<Member[] | undefined>(undefined)
  const [members, setMembers] = useState<Member[] | undefined>(undefined)
  const [loadMore, setLoadMore] = useState<boolean>(false)
  const [offsetPage, setOffsetPage] = useState<number>(0)

  function loadMoreMembers() {
    setLoadMore(true)
    getGroupMembers(groupId, offsetPage + 1)
      .then((result) => {
        if (members) {
          setMembers([...members, ...result.data])
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

    if (group.totalMembers > 250) return
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

  const channelFilter = { k: 'group_id', v: groupId } as const
  useRealtimeChannel('*', 'group_members', channelFilter, (_change) => {
    fetchGroupMembers()
  })

  return { admins, moderators, members, loadMore }
}

export function usePollingNumGroupMembers(groupId: string) {
  const q = db
    .from('group_members')
    .select('*', { head: true, count: 'exact' })
    .eq('group_id', groupId)
  return useSupabasePolling(q)?.count
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

// TODO: maybe this belongs in a more general file
function useAsyncData<T, R>(
  prop: T | undefined,
  asyncFn: (prop: T) => Promise<R>
) {
  const [data, setData] = useState<R | null>(null)
  useEffect(() => {
    if (prop) asyncFn(prop).then(setData).catch(console.error)
  }, [prop])
  return data
}

export function useGroupFromSlug(groupSlug: string) {
  return useAsyncData(groupSlug, (slug) => getGroupFromSlug(slug, db))
}

export function useListGroupsBySlug(groupSlugs: string[]) {
  return useAsyncData(groupSlugs, listGroupsBySlug)
}

export function useMyGroupRoles(userId: string | undefined) {
  return useAsyncData(userId, getMyGroupRoles)
}

export function useGroupsWhereUserHasRole(userId: string | undefined) {
  return useAsyncData(userId, getGroupsWhereUserHasRole)
}
