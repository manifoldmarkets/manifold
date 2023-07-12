import React from 'react'
import { useRouter } from 'next/router'

import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from './button'
import { PlayMoneyDisclaimer } from '../play-money-disclaimer'

export const SidebarSignUpButton = () => {
  const router = useRouter()

  return (
    <>
      <Button
        color="gradient"
        size="xl"
        onClick={async () => {
          // login, and then reload the page, to hit any SSR redirect (e.g.
          // redirecting from / to /home for logged in users)
          await firebaseLogin()
          router.replace(router.asPath)
        }}
        className="mt-4"
      >
        Sign up
      </Button>
      <PlayMoneyDisclaimer />
    </>
  )
}

export const GoogleSignInButton = (props: { onClick: () => any }) => {
  return (
    <button
      onClick={props.onClick}
      className="flex items-center whitespace-nowrap rounded-md bg-white p-2 text-sm shadow-sm outline-2 outline-indigo-200 hover:outline dark:bg-blue-500"
    >
      <img
        src="/google.svg"
        alt=""
        width={24}
        height={24}
        className="rounded-full bg-white"
      />
      <span className="w-3 shrink" />
      <span>Sign in with Google</span>
    </button>
  )
}
