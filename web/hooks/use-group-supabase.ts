import { JSONContent } from '@tiptap/core'
import { Group } from 'common/group'
import { User } from 'common/user'
import { cloneDeep } from 'lodash'
import { useEffect, useState } from 'react'
import { groupRoleType } from 'web/components/groups/group-member-modal'
import { db } from 'web/lib/supabase/db'
import {
  getGroupMembers,
  getGroupOfRole,
  getMemberRole,
  getNumGroupMembers,
} from 'web/lib/supabase/group'
import { useAdmin } from './use-admin'

export function useRealtimeGroupMembers(groupId: string, hitBottom: boolean) {
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
    if (hitBottom && !loadMore) {
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
        console.log(payload)
      }
    )
    channel.subscribe(async (status) => {})
  }, [db])
  return { admins, moderators, members, loadMore }
}

export function useRealtimeNumGroupMembers(groupId: string) {
  const [numMembers, setNumMembers] = useState<number | undefined>(undefined)

  useEffect(() => {
    getNumGroupMembers(groupId)
      .then((result) => setNumMembers(result))
      .catch((e) => console.log(e))
  }, [])

  useEffect(() => {
    const channel = db.channel('group-members-realtime')
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_members',
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        getNumGroupMembers(groupId)
          .then((result) => {
            setNumMembers(result)
          })
          .catch((e) => console.log(e))
      }
    )
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'group_members',
        filter: `group_id=eq.${groupId}`,
      },
      (_payload) => {
        getNumGroupMembers(groupId)
          .then((result) => setNumMembers(result))
          .catch((e) => console.log(e))
        // console.log('payload', payload)
      }
    )
    channel.subscribe(async (status) => {
      // console.log('STATUS', status)
    })
  }, [db])
  return numMembers
}

export function useMemberRole(group: Group | null, user?: User | null) {
  const [role, setRole] = useState<groupRoleType | null>(null)
  const isManifoldAdmin = useAdmin()
  if (user && group) {
    if (isManifoldAdmin) {
      setRole('admin')
    } else {
      getMemberRole(user, group.id).then((result) => {
        const data = result.data
        if (data.length > 0) {
          if (!data[0].role) {
            setRole('member')
          } else {
            setRole(data[0].role)
          }
        }
      })
    }
  }
  return role
}
