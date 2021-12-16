import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { getUserByUsername, User } from '../../lib/firebase/users'
import { UserPage } from '../../components/user-page'
import Error from 'next/error'

export default function UserProfile() {
  const router = useRouter()
  const [user, setUser] = useState<User | null | 'loading'>('loading')
  const atUsername = router.query.username as string | undefined
  const username = atUsername?.substring(1) || '' // Remove the initial @
  useEffect(() => {
    if (username) {
      getUserByUsername(username).then(setUser)
    }
  }, [username])

  const errorMessage = `Who is this "${username}" you speak of..`

  if (user === 'loading') return <></>

  return user ? (
    <UserPage user={user} />
  ) : (
    <Error statusCode={404} title={errorMessage} />
  )
}
