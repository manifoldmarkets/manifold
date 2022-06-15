import { useRouter } from 'next/router'
import React, { useEffect, useMemo, useState } from 'react'

import { getUserByUsername, User } from 'web/lib/firebase/users'
import { UserPage } from 'web/components/user-page'
import { useUser } from 'web/hooks/use-user'
import Custom404 from '../404'
import { useTracking } from 'web/hooks/use-tracking'

export default function UserProfile() {
  const router = useRouter()
  const [user, setUser] = useState<User | null | 'loading'>('loading')
  const { username, tab } = router.query as {
    username: string
    tab?: string | undefined
  }
  useEffect(() => {
    if (username) {
      getUserByUsername(username).then(setUser)
    }
  }, [username])

  const currentUser = useUser()
  const userPage = useMemo(() => {
    return user && user !== 'loading' ? (
      <UserPage
        user={user}
        currentUser={currentUser || undefined}
        defaultTabTitle={tab}
      />
    ) : (
      <div />
    )
  }, [user, currentUser, tab])

  useTracking('view user profile', { username })

  return user ? userPage : <Custom404 />
}
