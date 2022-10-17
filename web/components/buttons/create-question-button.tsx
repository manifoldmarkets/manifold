import React from 'react'
import { Button } from './button'
import { SiteLink } from 'web/components/widgets/site-link'

export const CreateQuestionButton = () => {
  return (
    <SiteLink href="/create">
      <Button color="gradient" size="xl" className="mt-4 w-full">
        Create a market
      </Button>
    </SiteLink>
  )
}
