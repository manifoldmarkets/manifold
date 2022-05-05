import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import { getUserByUsername, User } from '../../lib/firebase/users'
import { UserPage } from '../../components/user-page'
import { useUser } from '../../hooks/use-user'
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
      defaultTabIndex={tab === 'Comments' || tab === 'comments' ? 1 : 0}
    />
  ) : (
    <Custom404 />
  )
}
