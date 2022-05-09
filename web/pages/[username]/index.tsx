import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import { getUserByUsername, User } from 'web/lib/firebase/users'
import { UserPage } from 'web/components/user-page'
import { useUser } from 'web/hooks/use-user'
import Custom404 from '../404'

export default function UserProfile() {
  const router = useRouter()
  const [user, setUser] = useState<User | null | 'loading'>('loading')
  const { username, tab } = router.query as { username: string; tab: string }
  useEffect(() => {
    if (username) {
      getUserByUsername(username).then(setUser)
    }
  }, [username])

  const currentUser = useUser()

  if (user === 'loading') return <></>

  return user ? (
    <UserPage
      user={user}
      currentUser={currentUser || undefined}
      defaultTabTitle={tab}
    />
  ) : (
    <Custom404 />
  )
}
