import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import Error from 'next/error'

import { getUserByUsername, User } from '../../lib/firebase/users'
import { UserPage } from '../../components/user-page'
import { useUser } from '../../hooks/use-user'

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

  const errorMessage = `Who is this "${username}" you speak of..`

  if (user === 'loading') return <></>

  return user ? (
    <UserPage user={user} currentUser={currentUser || undefined} />
  ) : (
    <Error statusCode={404} title={errorMessage} />
  )
}
