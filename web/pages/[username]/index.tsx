import React from 'react'
import { getUserByUsername, User } from 'web/lib/firebase/users'
import { UserPage } from 'web/components/user-page'
import Custom404 from '../404'
import { useTracking } from 'web/hooks/use-tracking'
import { BlockedUser } from 'web/components/profile/blocked-user'
import { usePrivateUser } from 'web/hooks/use-user'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)
  return {
    props: {
      user,
      username,
      revalidate: 60, // Regenerate after 60 seconds
    },
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserProfile(props: {
  user: User | null
  username: string
}) {
  const { user, username } = props
  const privateUser = usePrivateUser()
  const blockedByCurrentUser =
    privateUser?.blockedUserIds.includes(user?.id ?? '_') ?? false

  useTracking('view user profile', { username })

  if (!user || user.userDeleted) {
    return <Custom404 />
  }

  return privateUser && blockedByCurrentUser ? (
    <BlockedUser user={user} privateUser={privateUser} />
  ) : (
    <UserPage user={user} />
  )
}
