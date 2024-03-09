import { track } from '@amplitude/analytics-browser'
import { PencilAltIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { DailyStats } from 'web/components/home/daily-stats'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import Welcome from 'web/components/onboarding/welcome'
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
import { ControlledTabs } from 'web/components/layout/tabs'
import { useUserTrendingTopics } from 'web/components/search/query-topics'
import { SupabaseSearch } from 'web/components/supabase-search'
import { BrowseTopicPills } from 'web/components/topics/browse-topic-pills'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { User } from 'common/user'
import { YourTopicsSection } from 'web/components/topics/your-topics'

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

  const [activeIndex, setActiveIndex] = usePersistentInMemoryState(
    0,
    `tabs-home`
  )

  return (
    <Col className="w-full max-w-3xl items-center self-center pb-4 sm:px-2">
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

      <Row className="mb-2 w-full justify-between">
        <ControlledTabs
          className="bg-canvas-50 sticky top-6 z-10 mb-1 px-1"
          onClick={(_, i) => {
            setActiveIndex(i)
          }}
          activeIndex={activeIndex}
          tabs={buildArray(
            {
              title: 'Home',
              content: null,
            },
            {
              title: 'Browse',
              content: null,
            },
            user && {
              title: 'Topics',
              content: null,
            }
          )}
        />
        <DailyStats className="mr-2" user={user} />
      </Row>

      {privateUser && (
        <FeedTimeline
          className={clsx(activeIndex !== 0 && 'hidden')}
          user={user}
          privateUser={privateUser}
        />
      )}
      <BrowseSection
        className={clsx(activeIndex !== 1 && 'hidden')}
        privateUser={privateUser}
        user={user}
      />
      {user && activeIndex === 2 && (
        <YourTopicsSection className="w-full" user={user} />
      )}

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
  className?: string
}) => {
  const { privateUser, user, className } = props

  const [topicSlug, setTopicSlug] = usePersistentInMemoryState(
    '',
    'home-browse'
  )
  const shouldFilterDestiny = useShouldBlockDestiny(user?.id)
  const userTrendingTopics = useUserTrendingTopics(user, 25)

  return (
    <Col className={clsx('max-w-full', className)}>
      <BrowseTopicPills
        className={'relative w-full py-1 pl-1'}
        topics={userTrendingTopics ?? []}
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
