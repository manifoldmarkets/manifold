import React, { useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import _ from 'lodash'

import { Page } from '../components/page'
import { ActivityFeed } from '../components/feed/activity-feed'
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'
import { LoadingIndicator } from '../components/loading-indicator'
import { useRecentBets } from '../hooks/use-bets'
import { useActiveContracts } from '../hooks/use-contracts'
import { useRecentComments } from '../hooks/use-comments'
import { useAlgoFeed } from '../hooks/use-algo-feed'
import { ContractPageContent } from './[username]/[contractSlug]'

const Home = () => {
  const user = useUser()

  const contracts = useActiveContracts()
  const contractsDict = _.keyBy(contracts, 'id')

  const recentBets = useRecentBets()
  const recentComments = useRecentComments()

  const feedContracts = useAlgoFeed(user, contracts, recentBets, recentComments)

  const updatedContracts = feedContracts.map(
    (contract) => contractsDict[contract.id] ?? contract
  )

  const router = useRouter()
  const slug = router.query.c as string | undefined
  const contract = feedContracts.find((c) => c.slug === slug)

  useEffect(() => {
    if (slug && !contract) {
      delete router.query.c
      router.replace(router, undefined, { shallow: true })
    }
  })

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <>
      <Page assertUser="signed-in" suspend={!!contract}>
        <Col className="items-center">
          <Col className="w-full max-w-[700px]">
            <FeedCreate user={user ?? undefined} />
            <Spacer h={10} />
            {contracts && recentBets && recentComments ? (
              <ActivityFeed
                contracts={updatedContracts}
                recentBets={recentBets}
                recentComments={recentComments}
                mode="only-recent"
                getContractPath={(c) => `home?c=${c.slug}`}
              />
            ) : (
              <LoadingIndicator className="mt-4" />
            )}
          </Col>
        </Col>
      </Page>

      {contract && (
        <ContractPageContent
          contract={contract}
          username={contract.creatorUsername}
          slug={contract.slug}
          bets={[]}
          comments={[]}
          backToHome={router.back}
        />
      )}
    </>
  )
}

export default Home
