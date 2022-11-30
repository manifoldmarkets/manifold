import React from 'react'
import { getUserByUsername, User } from 'web/lib/firebase/users'
import { UserPage } from 'web/components/user-page'
import Custom404 from '../404'
import { useTracking } from 'web/hooks/use-tracking'
import { BlockedUser } from 'web/components/profile/blocked-user'
import { usePrivateUser } from 'web/hooks/use-user'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'

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
    },
    revalidate: 60, // Regenerate after 60 second
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

  if (!user) return <Custom404 />
  else if (user.userDeleted) return <DeletedUser />

  return privateUser && blockedByCurrentUser ? (
    <BlockedUser user={user} privateUser={privateUser} />
  ) : (
    <UserPage user={user} />
  )
}

const DeletedUser = () => {
  return (
    <Page>
      <div className="flex h-full flex-col items-center justify-center">
        <Title text="Deleted account page" />
        <p>This user has been deleted.</p>
        <p>If you didn't expect this, let us know on Discord!</p>
        <br />
        <iframe
          src="https://discord.com/widget?id=915138780216823849&theme=dark"
          width="350"
          height="500"
          frameBorder="0"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        ></iframe>
      </div>
    </Page>
  )
}
