import React from 'react'
import Router from 'next/router'

import { Contract, getContractsBySlugs } from 'web/lib/firebase/contracts'
import { Page } from 'web/components/page'
import { FeedPromo } from 'web/components/feed-create'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'

export async function getStaticProps() {
  // These hardcoded markets will be shown in the frontpage for signed-out users:
  const hotContracts = await getContractsBySlugs([
    'if-boris-johnson-is-leader-of-the-c',
    'will-ethereum-merge-to-proofofstake',
    'will-russia-control-the-majority-of',
    'will-elon-musk-buy-twitter-this-yea',
    'will-an-ai-get-gold-on-any-internat',
    'how-many-us-supreme-court-justices',
    'who-will-win-the-nba-finals-champio',
    'what-database-will-manifold-be-prim',
    'will-the-supreme-court-leakers-iden',
    'will-over-25-of-participants-in-the-163d54309e43',
  ])

  return {
    props: { hotContracts },
    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: { hotContracts: Contract[] }) => {
  const { hotContracts } = props

  const user = useUser()

  if (user) {
    Router.replace('/home')
    return <></>
  }

  return (
    <Page assertUser="signed-out">
      <div className="px-4 pt-2 md:mt-0 lg:hidden">
        <ManifoldLogo />
      </div>
      <Col className="items-center">
        <Col className="max-w-3xl">
          <FeedPromo hotContracts={hotContracts ?? []} />
          {/* <p className="mt-6 text-gray-500">
            View{' '}
            <SiteLink href="/markets" className="font-bold text-gray-700">
              all markets
            </SiteLink>
          </p> */}
        </Col>
      </Col>
    </Page>
  )
}

export default Home
