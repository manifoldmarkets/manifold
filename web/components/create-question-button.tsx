import Link from 'next/link'
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
  return (
    <div className={clsx('flex justify-center', className)}>
      {user ? (
        <Link href={`/create${query ? query : ''}`} passHref>
          <button className={clsx(gradient, createButtonStyle)}>
            {overrideText ? overrideText : 'Create a question'}
          </button>
        </Link>
      ) : (
        <button
          onClick={firebaseLogin}
          className={clsx(gradient, createButtonStyle)}
        >
          Sign in
        </button>
      )}
    </div>
  )
}
