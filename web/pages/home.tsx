import React, { useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import _ from 'lodash'

import { Page } from 'web/components/page'
import { ActivityFeed } from 'web/components/feed/activity-feed'
import FeedCreate from 'web/components/feed-create'
import { Spacer } from 'web/components/layout/spacer'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { useAlgoFeed } from 'web/hooks/use-algo-feed'
import { ContractPageContent } from './[username]/[contractSlug]'
import { CategorySelector } from '../components/feed/category-selector'

const Home = () => {
  const user = useUser()

  const feed = useAlgoFeed(user)

  const router = useRouter()
  const { u: username, s: slug } = router.query
  const contract = feed?.find(
    ({ contract }) => contract.slug === slug
  )?.contract

  useEffect(() => {
    // If the page initially loads with query params, redirect to the contract page.
    if (router.isReady && slug && username) {
      Router.replace(`/${username}/${slug}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])

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
            <Spacer h={2} />

            <CategorySelector user={user} />

            <Spacer h={1} />

            {feed ? (
              <ActivityFeed
                feed={feed}
                mode="only-recent"
                getContractPath={(c) =>
                  `home?u=${c.creatorUsername}&s=${c.slug}`
                }
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
