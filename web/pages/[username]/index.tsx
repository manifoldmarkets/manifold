import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { getUserByUsername, User } from '../../lib/firebase/users'
import { UserPage } from '../account'
import Error from 'next/error'

export default function UserProfile() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const { username } = router.query as { username: string }
  useEffect(() => {
    if (username) {
      getUserByUsername(username).then(setUser)
    }
  }, [username])

  const errorMessage = `Who is this "${username}" you speak of..`
  return user ? (
    <UserPage user={user} />
  ) : (
    <Error statusCode={404} title={errorMessage} />
  )
}
