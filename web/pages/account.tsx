import React from 'react'
import { NavBar } from '../components/nav-bar'
import { UserPage } from '../components/user-page'
import { useUser } from '../hooks/use-user'
import { firebaseLogin } from '../lib/firebase/users'

function SignInCard() {
  return (
    <div className="card glass sm:card-side shadow-xl hover:shadow-xl text-neutral-content bg-green-600 hover:bg-green-600 transition-all max-w-sm mx-4 sm:mx-auto my-12">
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
  return user ? (
    <UserPage user={user} currentUser={user} />
  ) : (
    <div className="max-w-4xl px-4 pb-8 mx-auto">
      <NavBar />
      <SignInCard />
    </div>
  )
}
