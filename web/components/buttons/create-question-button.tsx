import React from 'react'
import { buttonClass } from './button'
import clsx from 'clsx'
import Link from 'next/link'

export const CreateQuestionButton = () => {
  return (
    <Link
      href="/create"
      className={clsx(
        buttonClass('xl', 'gradient'),
        'mt-4 w-full bg-gradient-to-r !px-3 text-white'
      )}
    >
      Create a market
    </Link>
  )
}
