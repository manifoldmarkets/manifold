import { useEffect, useState } from 'react'
import { canCreateManalink } from 'common/manalink'
import { User } from 'common/user'
import { db } from 'web/lib/supabase/db'

export const useCanCreateManalink = (user: User) => {
  const [canCreate, setCanCreate] = useState(false)
  useEffect(() => {
    canCreateManalink(user, db).then(setCanCreate)
  }, [user])
  return canCreate
}
