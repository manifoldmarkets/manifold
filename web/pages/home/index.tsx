import { track } from '@amplitude/analytics-browser'
import { PencilAltIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { uniqBy } from 'lodash'

import { DailyStats } from 'web/components/home/daily-stats'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import Welcome from 'web/components/onboarding/welcome'
import { Title } from 'web/components/widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'
import { FeedTimeline } from 'web/components/feed-timeline'
import { api } from 'web/lib/firebase/api'
import { Headline } from 'common/news'
import { HeadlineTabs } from 'web/components/dashboard/header'
import { WelcomeTopicSections } from 'web/components/home/welcome-topic-sections'
import { useNewUserMemberTopicsAndContracts } from 'web/hooks/use-group-supabase'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { DAY_MS } from 'common/util/time'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import {
  PrivateUser,
  freeQuestionRemaining,
  DAYS_TO_USE_FREE_QUESTIONS,
} from 'common/user'
import { buildArray } from 'common/util/array'
import Router from 'next/router'
import { Col } from 'web/components/layout/col'
import { Tabs } from 'web/components/layout/tabs'
import {
  useUserTrendingTopics,
  useTrendingTopics,
} from 'web/components/search/query-topics'
import { SupabaseSearch } from 'web/components/supabase-search'
import { BrowseTopicPills } from 'web/components/topics/browse-topic-pills'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { User } from 'common/user'
import { Group } from 'common/group'

export async function getStaticProps() {
  try {
    const headlines = await api('headlines', {})
    return {
      props: {
        headlines,
        revalidate: 30 * 60, // 30 minutes
      },
    }
  } catch (err) {
    return { props: { headlines: [] }, revalidate: 60 }
  }
}

export default function Home(props: { headlines: Headline[] }) {
  const isClient = useIsClient()

  useRedirectIfSignedOut()
  const user = useUser()
  const privateUser = usePrivateUser()
  useSaveReferral(user)
  useSaveScroll('home')

  const { headlines } = props
  const memberTopicsWithContracts = useNewUserMemberTopicsAndContracts(user)
  const createdRecently = (user?.createdTime ?? 0) > Date.now() - DAY_MS

  return (
    <>
      <Welcome />
      <Page
        trackPageView={'home'}
        trackPageProps={{ kind: 'desktop' }}
        className="!mt-0"
      >
        <HeadlineTabs
          endpoint={'news'}
          headlines={headlines}
          currentSlug={'home'}
        />
        <Row className="mx-3 mb-2 items-center gap-2">
          <Title className="!mb-0 whitespace-nowrap">Home</Title>

          <DailyStats user={user} />
        </Row>
        {!user ? (
          <LoadingIndicator />
        ) : !createdRecently ? (
          isClient ? (
            <HomeContent user={user} privateUser={privateUser} />
          ) : null
        ) : !memberTopicsWithContracts ? (
          <LoadingIndicator />
        ) : (
          <>
            <WelcomeTopicSections
              memberTopicsWithContracts={memberTopicsWithContracts}
            />
            {isClient && <HomeContent user={user} privateUser={privateUser} />}
          </>
        )}
      </Page>
    </>
  )
}

export function HomeContent(props: {
  user: User | undefined | null
  privateUser: PrivateUser | undefined | null
}) {
  const { user, privateUser } = props
  const remaining = freeQuestionRemaining(
    user?.freeQuestionsCreated,
    user?.createdTime
  )
  return (
    <Col className="w-full pb-4 sm:px-2">
      {user && remaining > 0 && (
        <Row className="text-md mb-2 items-center justify-between gap-2 self-center rounded-md border-2 border-indigo-500 p-2">
          <span>
            🎉 You've got{' '}
            <span className="font-semibold">{remaining} free questions</span>!
            Use them before they expire in{' '}
            {shortenedFromNow(
              user.createdTime + DAY_MS * DAYS_TO_USE_FREE_QUESTIONS
            )}
            .
          </span>
          <CreateQuestionButton className={'max-w-[10rem]'} />
        </Row>
      )}
      <Tabs
        className="bg-canvas-50 sticky top-6 z-10 mb-1 px-1"
        tabs={[
          {
            title: 'Feed',
            content: privateUser && (
              <FeedTimeline user={user} privateUser={privateUser} />
            ),
            prerender: true,
          },
          {
            title: 'Browse',
            content: <BrowseSection privateUser={privateUser} user={user} />,
            prerender: true,
          },
        ]}
      />
      <button
        type="button"
        className={clsx(
          'focus:ring-primary-500 fixed  right-3 z-20 inline-flex items-center rounded-full border  border-transparent  p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 lg:hidden',
          'disabled:bg-ink-300 text-ink-0 from-primary-500 hover:from-primary-700 to-blue-500 hover:to-blue-700 enabled:bg-gradient-to-r',
          'bottom-[64px]'
        )}
        onClick={() => {
          Router.push('/create')
          track('mobile create button')
        }}
      >
        <PencilAltIcon className="h-6 w-6" aria-hidden="true" />
      </button>
    </Col>
  )
}

const BrowseSection = (props: {
  privateUser: PrivateUser | null | undefined
  user: User | undefined | null
}) => {
  const { privateUser, user } = props

  const [topicSlug, setTopicSlug] = usePersistentInMemoryState(
    '',
    'home-browse'
  )
  const shouldFilterDestiny = useShouldBlockDestiny(user?.id)
  const userTrendingTopics = useUserTrendingTopics(user, 25)
  const trendingTopics = useTrendingTopics(
    50,
    'home-page-trending-topics'
  ) as Group[]
  const topics = uniqBy(
    [...(userTrendingTopics ?? []), ...trendingTopics],
    'slug'
  )

  return (
    <Col>
      <BrowseTopicPills
        className={'relative w-full py-1 pl-1'}
        topics={topics}
        currentTopicSlug={topicSlug}
        setTopicSlug={(slug) => setTopicSlug(slug === topicSlug ? '' : slug)}
      />
      <SupabaseSearch
        persistPrefix="browse-home"
        autoFocus={false}
        additionalFilter={{
          excludeContractIds: privateUser?.blockedContractIds,
          excludeGroupSlugs: buildArray(
            privateUser?.blockedGroupSlugs,
            shouldFilterDestiny &&
              !DESTINY_GROUP_SLUGS.includes(topicSlug ?? '') &&
              DESTINY_GROUP_SLUGS
          ),
          excludeUserIds: privateUser?.blockedUserIds,
        }}
        hideSearch
        hideContractFilters
        topicSlug={topicSlug}
        contractsOnly
      />
    </Col>
  )
}
