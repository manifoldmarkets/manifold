import clsx from 'clsx'
import { firebaseLogout, User } from '../lib/firebase/users'
import { CreatorContractsList } from './contracts-list'
import { Title } from './title'
import { Row } from './layout/row'
import { formatMoney } from '../lib/util/format'
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

function UserCard(props: { user: User; showPrivateInfo?: boolean }) {
  const { user, showPrivateInfo } = props
  return (
    <Row className="card glass lg:card-side shadow-xl hover:shadow-xl text-neutral-content bg-green-600 hover:bg-green-600 transition-all max-w-sm my-12 mx-auto">
      <div className="p-4">
        {user?.avatarUrl && (
          <img
            src={user.avatarUrl}
            className="rounded-lg shadow-lg"
            width={96}
            height={96}
          />
        )}
      </div>
      <div className="max-w-md card-body">
        <div className="card-title font-major-mono">{user.name}</div>

        {showPrivateInfo && (
          <>
            <p>{formatMoney(user?.balance)}</p>
            <div className="card-actions">
              <button
                className="btn glass rounded-full hover:bg-green-500"
                onClick={firebaseLogout}
              >
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </Row>
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

      {/* <UserCard user={user} showPrivateInfo={isCurrentUser} /> */}

      <Title text={possesive + 'markets'} />

      <CreatorContractsList creator={user} />
    </Page>
  )
}
