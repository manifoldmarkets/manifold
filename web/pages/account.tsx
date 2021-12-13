import { firebaseLogin, firebaseLogout, User } from '../lib/firebase/users'
import { Header } from '../components/header'
import { useUser } from '../hooks/use-user'
import { useState, useEffect } from 'react'
import { Contract, listContracts } from '../lib/firebase/contracts'
import { ContractsList } from '../components/contracts-list'
import { Title } from '../components/title'

function UserCard(props: { user: User }) {
  const { user } = props
  return (
    <div className="card glass lg:card-side shadow-xl hover:shadow-xl text-neutral-content bg-green-600 hover:bg-green-600 transition-all max-w-sm mx-auto my-12">
      <figure className="p-6">
        {user?.avatarUrl && (
          <img src={user.avatarUrl} className="rounded-lg shadow-lg" />
        )}
      </figure>
      <div className="max-w-md card-body">
        <h2 className="card-title font-major-mono">{user?.name}</h2>
        <p>{user?.email}</p>
        <p>M$ {user?.balance}</p>
        <div className="card-actions">
          <button
            className="btn glass rounded-full hover:bg-green-500"
            onClick={firebaseLogout}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

function SignInCard() {
  return (
    <div className="card glass lg:card-side shadow-xl hover:shadow-xl text-neutral-content bg-green-600 hover:bg-green-600 transition-all max-w-sm mx-auto my-12">
      <figure className="p-6">
        <img
          src="/logo-icon-white-bg.png"
          className="rounded-lg shadow-lg w-20 h-20"
        />
      </figure>
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
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    console.log('Fetching contracts', user?.id)
    if (user?.id) {
      listContracts(user?.id).then(setContracts)
    }
  }, [user?.id])

  return (
    <div>
      <Header />
      <div className="max-w-4xl py-8 mx-auto">
        {user ? (
          <div>
            <UserCard user={user} />
            <Title text="Your markets" />
            <ContractsList contracts={contracts} />
          </div>
        ) : (
          <SignInCard />
        )}
      </div>
    </div>
  )
}
