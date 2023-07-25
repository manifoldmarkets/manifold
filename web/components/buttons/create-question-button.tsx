import React from 'react'
import { buttonClass } from './button'
import clsx from 'clsx'
import Link from 'next/link'

export const CreateQuestionButton = (props: { className?: string }) => {
  const { className } = props
  return (
    <Link
      href="/create"
      className={clsx(
        buttonClass('xl', 'gradient'),
        'w-full bg-gradient-to-r px-3 text-white',
        className
      )}
    >
      Create a question
    </Link>
  )
}
