import clsx from 'clsx'
import { User } from '../lib/firebase/users'
import { CreatorContractsList } from './contracts-list'
import { Title } from './title'
import { SEO } from './SEO'
import { Page } from './page'
import { SiteLink } from './site-link'

export function UserLink(props: {
  name: string
  username: string
  showUsername?: boolean
  className?: string
}) {
  const { name, username, showUsername, className } = props

  return (
    <SiteLink href={`/${username}`} className={clsx('z-10', className)}>
      {name}
      {showUsername && ` (@${username})`}
    </SiteLink>
  )
}

export function UserPage(props: { user: User; currentUser?: User }) {
  const { user, currentUser } = props

  const isCurrentUser = user.id === currentUser?.id

  const possesive = isCurrentUser ? 'Your ' : `${user.name}'s `

  return (
    <Page>
      <SEO
        title={possesive + 'markets'}
        description={possesive + 'markets'}
        url={`/@${user.username}`}
      />

      <Title text={possesive + 'markets'} />

      <CreatorContractsList creator={user} />
    </Page>
  )
}
