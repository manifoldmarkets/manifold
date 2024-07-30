import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'

import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Row } from 'web/components/layout/row'
import { TestimonialsPanel } from 'web/components/testimonials-panel'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { AboutPrivacyTerms } from 'web/components/privacy-terms'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { LogoSEO } from 'web/components/LogoSEO'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Contract } from 'common/contract'
import { db } from 'web/lib/supabase/db'
import { HIDE_FROM_NEW_USER_SLUGS } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import { some } from 'd3-array'
import { useABTest } from 'web/hooks/use-ab-test'
import { Typewriter } from 'web/components/home/typewriter'
import { PillButton } from 'web/components/buttons/pill-button'
import { Carousel } from 'web/components/widgets/carousel'
import { removeEmojis } from 'common/util/string'
import { filterDefined } from 'common/util/array'
import { useGoogleAnalytics } from 'web/hooks/use-google-analytics'
import { getContract } from 'common/supabase/contracts'

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const { data } = await db
    .from('contracts')
    .select('data')
    .not(
      'outcome_type',
      'in',
      `(${['STONK', 'BOUNTIED_QUESTION', 'POLL'].join(',')})`
    )
    .order('importance_score', { ascending: false })
    .limit(100)

  const contracts = (data ?? []).map((d) => d.data) as Contract[]

  const prezContract = await getContract(db, 'ikSUiiNS8MwAI75RwEJf')

  const filteredContracts = contracts.filter(
    (c) =>
      !c.groupSlugs?.some((slug) =>
        HIDE_FROM_NEW_USER_SLUGS.includes(slug as any)
      )
  )

  const hasCommonGroupSlug = (contract: Contract, groupSlugsSet: string[]) =>
    some(contract.groupSlugs ?? [], (slug) => groupSlugsSet.includes(slug))

  const addedGroupSlugs: string[] = ['us-politics']
  const uniqueContracts: Contract[] = filterDefined([prezContract])
  filteredContracts.forEach((contract) => {
    if (!hasCommonGroupSlug(contract, addedGroupSlugs)) {
      uniqueContracts.push(contract)
      addedGroupSlugs.push(...(contract.groupSlugs ?? []))
    }
  })
  const topicSlugs = [
    'us-politics',
    'technology-default',
    'ai',
    'entertainment',
    'sports-default',
    'science-default',
  ]
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

  const user = useUser()
  useSaveReferral(user)
  useSaveCampaign()
  useRedirectIfSignedIn()
  useGoogleAnalytics()

  const [selectedTopicSlug, setSelectedTopicSlug] = useState<string>()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const contracts = selectedTopicSlug
    ? topicSlugToContracts[selectedTopicSlug] ?? []
    : trendingContracts
  const abTestVariant = useABTest('signed out home page variations v0', [
    'know the future',
    'real-world impact',
    'wisdom of the crowds',
    'bet',
    'bet-typewriter',
  ])

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
              <Link href="/election" className="hidden lg:flex">
                <Button
                  color="gray-white"
                  size="xs"
                  className="whitespace-nowrap"
                >
                  US Election
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
              {abTestVariant === 'know the future' && (
                <>
                  <h1 className="mb-4 text-4xl">Know the future</h1>
                  <h1 className="text-lg">
                    Harness wisdom of the crowds to predict politics, pandemics,
                    tech breakthroughs & more with
                    <span className={'ml-1 underline'}>play money</span>.
                  </h1>
                  <h1 className="text-lg">
                    Forecasting for everything that matters.
                  </h1>
                </>
              )}
              {abTestVariant === 'real-world impact' && (
                <>
                  <h1 className="mb-4 text-4xl">
                    Play-money betting.
                    <br />
                    Real-world impact.
                  </h1>
                  <h1 className="text-lg">
                    Harness humanity's collective intelligence to make smarter
                    decisions through forecasting.
                  </h1>
                  <h1 className="text-lg">
                    Join a global community betting on a better world.
                  </h1>
                </>
              )}
              {abTestVariant === 'wisdom of the crowds' && (
                <>
                  <h1 className="mb-4 text-4xl">
                    Harness the wisdom of the crowds
                  </h1>
                  <h1 className="text-lg">
                    <span className={'underline'}>Play-money</span> betting.{' '}
                    <span className={'underline'}>Real-world</span> decisions.
                  </h1>
                  <h1 className="text-lg">
                    Shape the world with accurate forecasts for better
                    decision-making.
                  </h1>
                </>
              )}
              {abTestVariant === 'bet' && (
                <>
                  <h1 className="mb-4 text-4xl">Bet on politics & more</h1>
                  <h1 className="text-lg">
                    Play-money markets. Real-world accuracy.
                  </h1>
                  <h1 className="text-lg">
                    Compete with your friends by betting on politics, tech,
                    sports, and more. It's play money and free to play.
                  </h1>
                </>
              )}
              {abTestVariant === 'bet-typewriter' && (
                <>
                  <h1 className="mb-4 text-4xl">
                    Bet on the next:{' '}
                    <Row>
                      <Typewriter
                        words={[
                          'election',
                          'tech breakthrough',
                          'game',
                          'bachelor',
                        ]}
                      />
                    </Row>
                  </h1>
                  <h1 className="text-lg">
                    Play-money betting. Real-world accuracy.
                  </h1>
                  <h1 className="text-lg">
                    Forecast events in politics, policy, technology, sports &
                    beyond.
                  </h1>
                </>
              )}
              <Button
                color="gradient"
                size="2xl"
                className="mt-8"
                onClick={firebaseLogin}
              >
                {abTestVariant === 'know the future'
                  ? 'See the forecasts'
                  : abTestVariant === 'real-world impact'
                  ? 'Forecast the future'
                  : 'Start predicting'}
              </Button>
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
        <Col>
          <Row className={'mb-3 text-xl'}>🔥 Trending Topics</Row>
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

        <AboutPrivacyTerms />
      </Col>
    </Page>
  )
}
