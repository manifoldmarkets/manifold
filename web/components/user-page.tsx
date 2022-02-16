import clsx from 'clsx'
import { User } from '../lib/firebase/users'
import { CreatorContractsList } from './contracts-list'
import { SEO } from './SEO'
import { Page } from './page'
import { SiteLink } from './site-link'
import { Avatar } from './avatar'
import { Col } from './layout/col'
import { Linkify } from './linkify'
import { Spacer } from './layout/spacer'
import { Row } from './layout/row'

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

  const bannerImageUrl =
    'https://images.unsplash.com/photo-1548197253-652ffe79752c?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1975&q=80'

  const placeholderBio = `Hi! Always happy to chat; reach out at akrolsmir@gmail.com, or find a time on https://calendly.com/austinchen/manifold !`

  return (
    <Page>
      <SEO
        title={possesive + 'markets'}
        description={possesive + 'markets'}
        url={`/${user.username}`}
      />

      {/* Banner image up top, with an circle avatar overlaid */}
      <div
        className="h-32 w-full bg-cover bg-center sm:h-40"
        style={{
          backgroundImage: `url(${bannerImageUrl})`,
        }}
      />
      <div className="relative -top-10 left-4">
        <Avatar username={user.username} avatarUrl={user.avatarUrl} size={20} />
      </div>

      {/* Profile details: name, username, bio, and link to twitter/discord */}
      <Col className="mx-4 -mt-6">
        <span className="text-2xl font-bold">{user.name}</span>
        <span className="text-gray-500">@{user.username}</span>
        <Spacer h={4} />

        <div>
          <Linkify text={placeholderBio}></Linkify>
        </div>
        <Spacer h={4} />

        <Row className="gap-4">
          <a href={`https://twitter.com/akrolsmir`}>
            <Row className="items-center gap-1">
              <img src="/twitter-logo.svg" className="h-4 w-4" alt="Twitter" />
              <span className="text-sm text-gray-500">akrolsmir</span>
            </Row>
          </a>

          <a href="https://discord.com/invite/eHQBNBqXuh">
            <Row className="items-center gap-1">
              <img src="/discord-logo.svg" className="h-4 w-4" alt="Discord" />
              <span className="text-sm text-gray-500">akrolsmir#4125</span>
            </Row>
          </a>
        </Row>

        <Spacer h={10} />

        <CreatorContractsList creator={user} />
      </Col>
    </Page>
  )
}
