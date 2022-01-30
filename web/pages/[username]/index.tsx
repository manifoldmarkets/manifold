import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import { getUserByUsername, User } from '../../lib/firebase/users'
import { UserPage } from '../../components/user-page'
import { useUser } from '../../hooks/use-user'
import Custom404 from '../404'

// TODO: SEO component for hyperlinking to this page

export default function UserProfile() {
  const router = useRouter()
  const [user, setUser] = useState<User | null | 'loading'>('loading')
  const { username } = router.query as { username: string }
  useEffect(() => {
    if (username) {
      getUserByUsername(username).then(setUser)
    }
  }, [username])

  const currentUser = useUser()

  if (user === 'loading') return <></>

  return user ? (
    <UserPage user={user} currentUser={currentUser || undefined} />
  ) : (
    <Custom404 />
  )
}
