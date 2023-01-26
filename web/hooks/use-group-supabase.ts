import { Group } from 'common/group'
import { User } from 'common/user'
import { useState } from 'react'
import { groupRoleType } from 'web/components/groups/group-member-modal'
import { getMemberRole } from 'web/lib/supabase/group'
import { useAdmin } from './use-admin'

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
