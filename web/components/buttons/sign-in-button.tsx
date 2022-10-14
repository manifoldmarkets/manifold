import React from 'react'
import { useRouter } from 'next/router'

import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from './button'

export const SignInButton = (props: { className?: string }) => {
  const router = useRouter()

  return (
    <Button
      size="lg"
      color="gradient"
      onClick={async () => {
        // login, and then reload the page, to hit any SSR redirect (e.g.
        // redirecting from / to /home for logged in users)
        await firebaseLogin()
        router.replace(router.asPath)
      }}
      className={props.className}
    >
      Sign in
    </Button>
  )
}
