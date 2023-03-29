import React from 'react'
import { useRouter } from 'next/router'
import { firebaseLogin } from 'web/lib/firebase/users'

export const SignInButton = () => {
  const router = useRouter()

  return (
    <div className="mt-4">
      <GoogleSignInButton
        onClick={async () => {
          // login, and then reload the page, to hit any SSR redirect (e.g.
          // redirecting from / to /home for logged in users)
          await firebaseLogin()
          router.replace(router.asPath)
        }}
      />
    </div>
  )
}

export const GoogleSignInButton = (props: { onClick: () => any }) => {
  return (
    <button
      onClick={props.onClick}
      className="flex items-center whitespace-nowrap rounded-md bg-white p-2 text-sm shadow-sm outline-2 outline-indigo-200 hover:outline dark:bg-blue-500"
    >
      <img src="/google-32x32.png" alt="" className="h-6 w-6" />
      <span className="w-3 shrink" />
      <span>Sign in with Google</span>
    </button>
  )
}
