import Router from 'next/router'
import { useEffect } from 'react'

import { BetsList } from 'web/components/bets-list'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { useUser } from 'web/hooks/use-user'

export default function PortfolioPage() {
  const user = useUser()

  useEffect(() => {
    if (user === null) Router.replace('/')
  })

  return (
    <Page>
      <SEO title="Portfolio" description="Portfolio" url="/portfolio" />
      <Title className="mx-4 md:mx-0" text="Portfolio" />
      {user && <BetsList user={user} />}
    </Page>
  )
}
