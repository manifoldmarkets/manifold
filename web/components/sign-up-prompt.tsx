import React from 'react'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'

export function SignUpPrompt(props: { label?: string }) {
  const { label } = props
  const user = useUser()

  return user === null ? (
    <button
      className="btn flex-1 whitespace-nowrap border-none bg-gradient-to-r from-indigo-500 to-blue-500 px-10 text-lg font-medium normal-case hover:from-indigo-600 hover:to-blue-600"
      onClick={withTracking(firebaseLogin, 'sign up to bet')}
    >
      {label ?? 'Sign up to bet!'}
    </button>
  ) : null
}
