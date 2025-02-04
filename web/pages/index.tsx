import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'

import { Contract } from 'common/contract'
import { HIDE_FROM_NEW_USER_SLUGS, TRADE_TERM } from 'common/envs/constants'
import { contractFields, convertContract } from 'common/supabase/contracts'
import { removeEmojis } from 'common/util/string'
import { some } from 'd3-array'
import { capitalize } from 'lodash'
import { LogoSEO } from 'web/components/LogoSEO'
import { Button } from 'web/components/buttons/button'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { PillButton } from 'web/components/buttons/pill-button'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { PlayMoneyDisclaimer } from 'web/components/play-money-disclaimer'
import { SweepsExplainer } from 'web/components/sweeps-explainer'
import { TestimonialsPanel } from 'web/components/testimonials-panel'
import { Carousel } from 'web/components/widgets/carousel'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { firebaseLogin } from 'web/lib/firebase/users'
import { db } from 'common/supabase/db'

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const { data } = await db
    .from('contracts')
    .select(contractFields)
    .not(
      'outcome_type',
      'in',
      `(${['STONK', 'BOUNTIED_QUESTION', 'POLL'].join(',')})`
    )
    .is('resolution', null)
    .eq('token', 'MANA')
    .order('importance_score', { ascending: false })
    .limit(100)

  const contracts = (data ?? []).map(convertContract)

  const filteredContracts = contracts.filter(
    (c) =>
      !c.groupSlugs?.some((slug) =>
        HIDE_FROM_NEW_USER_SLUGS.includes(slug as any)
      ) && !c.isResolved // Add this condition to filter out resolved contracts
  )

  const hasCommonGroupSlug = (contract: Contract, groupSlugsSet: string[]) =>
    some(contract.groupSlugs ?? [], (slug) => groupSlugsSet.includes(slug))

  const addedGroupSlugs: string[] = ['us-politics']
  const uniqueContracts: Contract[] = []

  filteredContracts.forEach((contract) => {
    if (!hasCommonGroupSlug(contract, addedGroupSlugs)) {
      uniqueContracts.push(contract)
      addedGroupSlugs.push(...(contract.groupSlugs ?? []))
    }
  })
  const topicSlugs = ['us-politics', 'technology-default', 'sports-default']
  const topicSlugToContracts: Record<string, Contract[]> = {}
  topicSlugs.forEach((slug) => {
    topicSlugToContracts[slug] = filteredContracts
      .filter((c) => (c.groupSlugs ?? []).includes(slug))
      .slice(0, 7)
  })
  const { data: topicData } = await db
    .from('groups')
    .select('name,slug')
    .in('slug', topicSlugs)
  // Order topics by topicSlugs order
  const topics = (topicData ?? []).sort(
    (a, b) => topicSlugs.indexOf(a.slug) - topicSlugs.indexOf(b.slug)
  )

  return {
    props: {
      trendingContracts: uniqueContracts.slice(0, 7),
      topicSlugToContracts,
      topics,
    },
  }
})

export default function LandingPage(props: {
  trendingContracts: Contract[]
  topicSlugToContracts: Record<string, Contract[]>
  topics: { name: string; slug: string }[]
}) {
  const { trendingContracts, topicSlugToContracts, topics } = props

  useSaveCampaign()
  useRedirectIfSignedIn()

  const [selectedTopicSlug, setSelectedTopicSlug] = useState<string>()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const contracts = selectedTopicSlug
    ? topicSlugToContracts[selectedTopicSlug] ?? []
    : trendingContracts

  return (
    <Page trackPageView={'signed out home page'} hideSidebar>
      <Col className="mx-auto mb-8 w-full gap-8 px-4">
        <Col className="gap-4">
          <Row className="items-center justify-between">
            <ManifoldLogo />
            <LogoSEO />

            <Row className="items-center gap-2">
              <Link href="/about">
                <Button color="gray-white" size="xs">
                  About
                </Button>
              </Link>
              <Link href="/browse">
                <Button
                  color="gray-white"
                  size="xs"
                  className="hidden whitespace-nowrap lg:flex"
                >
                  Browse
                </Button>
              </Link>
              <Button
                color="gray-white"
                size="xs"
                onClick={() => setIsModalOpen(true)}
                className="hidden whitespace-nowrap lg:flex"
              >
                Get app
              </Button>
              <Button
                color="gray-white"
                size="xs"
                onClick={firebaseLogin}
                className="whitespace-nowrap"
              >
                Sign in
              </Button>
              <Button
                color="indigo"
                size="xs"
                onClick={firebaseLogin}
                className="hidden whitespace-nowrap lg:flex"
              >
                Sign up
              </Button>

              <MobileAppsQRCodeDialog
                isModalOpen={isModalOpen}
                setIsModalOpen={setIsModalOpen}
              />
            </Row>
          </Row>

          <Row className="justify-between rounded-lg ">
            <Col className="w-full gap-2 sm:max-w-lg">
              <h1 className="mb-4 text-4xl">
                {capitalize(TRADE_TERM)} on politics & more
              </h1>

              <div className="text-lg">
                <div className="mb-2">
                  The largest social prediction market.
                </div>
                <div className="mb-2">
                  Get real-time odds on politics, tech, and sports. Win cash
                  prizes for your predictions!
                </div>
              </div>

              <Button
                color="gradient"
                size="2xl"
                className="mt-4"
                onClick={firebaseLogin}
              >
                Start predicting
              </Button>
              <PlayMoneyDisclaimer isLong />
            </Col>
            <Col className="mx-auto hidden h-full sm:flex">
              <img
                src="welcome/manipurple.png"
                width={220}
                alt={'manifold logo'}
                className="my-auto"
              />
            </Col>
          </Row>
        </Col>
        <SweepsExplainer />
        <Col>
          <Row className={'mb-3 mt-2 text-xl'}>🔥 Trending Topics</Row>
          <Carousel labelsParentClassName={'gap-2'} className="mx-1">
            {topics.map((topic) => (
              <PillButton
                key={topic.slug}
                onSelect={() =>
                  setSelectedTopicSlug(
                    selectedTopicSlug === topic.slug ? undefined : topic.slug
                  )
                }
                selected={selectedTopicSlug === topic.slug}
              >
                {removeEmojis(topic.name)}
              </PillButton>
            ))}
          </Carousel>
        </Col>
        <Col className={clsx('w-full gap-4 self-center')}>
          {contracts.map((contract) => (
            <FeedContractCard
              key={contract.id + selectedTopicSlug}
              contract={contract}
            />
          ))}
        </Col>
        <TestimonialsPanel />
      </Col>
    </Page>
  )
}
