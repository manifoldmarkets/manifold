import React from 'react'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'

export function SignUpPrompt() {
  const user = useUser()

  return user === null ? (
    <button
      className="btn flex-1 whitespace-nowrap border-none bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
      onClick={withTracking(firebaseLogin, 'sign up to bet')}
    >
      Sign up to bet!
    </button>
  ) : null
}
