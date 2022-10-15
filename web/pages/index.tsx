import { useEffect } from 'react'
import Router from 'next/router'

import { Contract, getTrendingContracts } from 'web/lib/firebase/contracts'
import { Page } from 'web/components/layout/page'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const hotContracts = await getTrendingContracts()
  return { props: { hotContracts } }
})

export default function Home(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props

  useSaveReferral()
  useRedirectAfterLogin()

  return (
    <Page>
      <SEO
        title="Manifold Markets"
        description="Create a play-money prediction market on any topic you care about
            and bet with your friends on what will happen!"
      />
      <div className="px-4 pt-2 md:mt-0 lg:hidden">
        <ManifoldLogo />
      </div>
      <Col className="items-center">
        <Col className="max-w-3xl">
          <LandingPagePanel hotContracts={hotContracts ?? []} />
        </Col>
      </Col>
    </Page>
  )
}

const useRedirectAfterLogin = () => {
  const user = useUser()

  useEffect(() => {
    if (user) {
      Router.replace('/home')
    }
  }, [user])
}
