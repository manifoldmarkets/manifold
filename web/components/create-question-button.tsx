import React from 'react'
import Link from 'next/link'
import clsx from 'clsx'

import { User } from 'web/lib/firebase/users'
import { Button } from './button'

export const CreateQuestionButton = (props: {
  user: User | null | undefined
  overrideText?: string
  className?: string
  query?: string
}) => {
  const { user, overrideText, className, query } = props

  if (!user || user?.isBannedFromPosting) return <></>

  return (
    <div className={clsx('flex justify-center', className)}>
      <Link href={`/create${query ? query : ''}`} passHref>
        <Button color="gradient" size="xl" className="mt-4">
          {overrideText ?? 'Create a market'}
        </Button>
      </Link>
    </div>
  )
}
