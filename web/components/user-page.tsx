import { firebaseLogout, User } from '../lib/firebase/users'
import { Header } from './header'
import { ContractsList } from './contracts-list'
import { Title } from './title'
import { Row } from './layout/row'
import { formatMoney } from '../lib/util/format'
import { BetsList } from './bets-list'
import { Spacer } from './layout/spacer'
import Link from 'next/link'
import clsx from 'clsx'

export function UserLink(props: { displayName: string; className?: string }) {
  const { displayName, className } = props
  // Fix this when users can change their own names
  const username = displayName.replace(/\s+/g, '')

  return (
    <Link href={`/@${username}`}>
      <a
        className={clsx(
          'hover:underline hover:decoration-indigo-400 hover:decoration-2',
          className
        )}
      >
        @{username}
      </a>
    </Link>
  )
}

function UserCard(props: { user: User }) {
  const { user } = props
  return (
    <Row className="card glass lg:card-side shadow-xl hover:shadow-xl text-neutral-content bg-green-600 hover:bg-green-600 transition-all max-w-sm mx-auto my-12">
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
        <UserLink
          displayName={user?.name}
          className="card-title font-major-mono"
        />
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
      </div>
    </Row>
  )
}

export function UserPage(props: { user: User }) {
  const { user } = props
  return (
    <div>
      <Header />
      <div className="max-w-4xl pt-8 pb-0 sm:pb-8 mx-auto">
        <div>
          <UserCard user={user} />

          <Title text="Your markets" />
          <ContractsList creator={user} />

          <Spacer h={4} />

          <Title text="Your bets" />
          <BetsList user={user} />
        </div>
      </div>
    </div>
  )
}
