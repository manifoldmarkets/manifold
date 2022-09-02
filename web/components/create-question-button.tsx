import React from 'react'
import Link from 'next/link'
import { Button } from './button'

export const CreateQuestionButton = () => {
  return (
    <Link href="/create" passHref>
      <Button color="gradient" size="xl" className="mt-4">
        Create a market
      </Button>
    </Link>
  )
}
