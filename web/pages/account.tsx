import { firebaseLogin, firebaseLogout, User } from '../lib/firebase/users'
import { Header } from '../components/header'
import { useUser } from '../hooks/use-user'
import { ContractsList } from '../components/contracts-list'
import { Title } from '../components/title'
import { Row } from '../components/layout/row'
import { formatMoney } from '../lib/util/format'

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
        <h2 className="card-title font-major-mono">{user?.name}</h2>
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

function SignInCard() {
  return (
    <div className="card glass lg:card-side shadow-xl hover:shadow-xl text-neutral-content bg-green-600 hover:bg-green-600 transition-all max-w-sm mx-auto my-12">
      <div className="p-4">
        <img
          src="/logo-icon-white-bg.png"
          className="rounded-lg shadow-lg w-20 h-20"
        />
      </div>
      <div className="max-w-md card-body">
        <h2 className="card-title font-major-mono">Welcome!</h2>
        <p>Sign in to get started</p>
        <div className="card-actions">
          <button
            className="btn glass rounded-full hover:bg-green-500"
            onClick={firebaseLogin}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Account() {
  const user = useUser()

  return (
    <div>
      <Header />
      <div className="max-w-4xl pt-8 pb-0 sm:pb-8 mx-auto">
        {user ? (
          <div>
            <UserCard user={user} />
            <Title className="px-2" text="Your markets" />
            <ContractsList />
          </div>
        ) : (
          <SignInCard />
        )}
      </div>
    </div>
  )
}
