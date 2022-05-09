import React from 'react'
import { Page } from '../components/page'
import { UserPage } from '../components/user-page'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'

function SignInCard() {
  return (
    <div className="card glass sm:card-side text-neutral-content mx-4 my-12 max-w-sm bg-green-600 shadow-xl transition-all hover:bg-green-600 hover:shadow-xl sm:mx-auto">
      <div className="p-4">
        <img
          src="/logo-bg-white.png"
          className="h-20 w-20 rounded-lg shadow-lg"
        />
      </div>
      <div className="card-body max-w-md">
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
    <Page>
      <SignInCard />
    </Page>
  )
}
