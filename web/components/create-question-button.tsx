import Link from 'next/link'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import React from 'react'

export const createButtonStyle =
  'border-w-0 mx-auto mt-4 -ml-1 w-full rounded-md bg-gradient-to-r py-2.5 text-base font-semibold text-white shadow-sm lg:-ml-0 h-11'

export const CreateQuestionButton = (props: {
  user: User | null | undefined
  overrideText?: string
  className?: string
  query?: string
}) => {
  const gradient =
    'from-indigo-500 to-blue-500 hover:from-indigo-700 hover:to-blue-700'

  const { user, overrideText, className, query } = props
  const router = useRouter()
  return (
    <div className={clsx('flex justify-center', className)}>
      {user ? (
        <Link href={`/create${query ? query : ''}`} passHref>
          <button className={clsx(gradient, createButtonStyle)}>
            {overrideText ? overrideText : 'Create a market'}
          </button>
        </Link>
      ) : (
        <button
          onClick={async () => {
            // login, and then reload the page, to hit any SSR redirect (e.g.
            // redirecting from / to /home for logged in users)
            await firebaseLogin()
            router.replace(router.asPath)
          }}
          className={clsx(gradient, createButtonStyle)}
        >
          Sign in
        </button>
      )}
    </div>
  )
}
