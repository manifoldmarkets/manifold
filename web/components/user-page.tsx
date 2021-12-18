import { firebaseLogout, User } from '../lib/firebase/users'
import { Header } from './header'
import { ContractsList } from './contracts-list'
import { Title } from './title'
import { Row } from './layout/row'
import { formatMoney } from '../lib/util/format'
import Link from 'next/link'
import clsx from 'clsx'
import { SEO } from './SEO'

export function UserLink(props: { username: string; className?: string }) {
  const { username, className } = props

  return (
    <Link href={`/${username}`}>
      <a
        className={clsx(
          'hover:underline hover:decoration-indigo-400 hover:decoration-2',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        @{username}
      </a>
    </Link>
  )
}

function UserCard(props: { user: User; showPrivateInfo?: boolean }) {
  const { user, showPrivateInfo } = props
  return (
    <Row className="card glass lg:card-side shadow-xl hover:shadow-xl text-neutral-content bg-green-600 hover:bg-green-600 transition-all max-w-sm my-12">
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
            <p>{user?.email}</p>
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

  const possesive = isCurrentUser ? 'Your ' : `${user.username}'s `

  return (
    <div className="max-w-4xl px-4 pb-8 mx-auto">
      <SEO
        title={possesive + 'markets'}
        description={possesive + 'markets'}
        url={`/@${user.username}`}
      />

      <Header />

      <UserCard user={user} showPrivateInfo={isCurrentUser} />

      <Title text={possesive + 'markets'} />

      <ContractsList creator={user} />
    </div>
  )
}
