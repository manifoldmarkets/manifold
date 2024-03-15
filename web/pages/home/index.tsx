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
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { simpleFromNow } from 'web/lib/util/shortenedFromNow'
import { DESTINY_GROUP_SLUG } from 'common/envs/constants'
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
import { useABTest } from 'web/hooks/use-ab-test'

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
  const variant = useABTest('home welcome topics', ['welcome topics', 'browse'])
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
        {!user || !variant ? (
          <LoadingIndicator />
        ) : !createdRecently || variant === 'browse' ? (
          isClient ? (
            <HomeContent
              user={user}
              privateUser={privateUser}
              variant={variant}
            />
          ) : null
        ) : !memberTopicsWithContracts ? (
          <LoadingIndicator />
        ) : (
          <>
            <WelcomeTopicSections
              memberTopicsWithContracts={memberTopicsWithContracts}
            />
            {isClient && (
              <HomeContent
                user={user}
                privateUser={privateUser}
                variant={variant}
              />
            )}
          </>
        )}
      </Page>
    </>
  )
}

export function HomeContent(props: {
  user: User | undefined | null
  privateUser: PrivateUser | undefined | null
  variant: 'welcome topics' | 'browse'
}) {
  const { user, privateUser, variant } = props
  const remaining = freeQuestionRemaining(
    user?.freeQuestionsCreated,
    user?.createdTime
  )
  const createdInLastHour = (user?.createdTime ?? 0) > Date.now() - HOUR_MS

  const freeQuestionsVariant = useABTest('free questions display', [
    'show',
    'hide-for-an-hour',
  ])
  const freeQuestionsEnabled =
    freeQuestionsVariant === 'show' || !createdInLastHour

  const [activeIndex, setActiveIndex] = usePersistentInMemoryState(
    createdInLastHour && variant === 'browse' ? 1 : 0,
    `tabs-home`
  )

  return (
    <Col className="w-full max-w-[800px] items-center self-center pb-4 sm:px-2">
      {user && freeQuestionsEnabled && remaining > 0 && (
        <Col className="text-md mb-2 w-full items-stretch justify-stretch gap-2 self-center rounded-md bg-indigo-100 px-4 py-2 sm:flex-row sm:items-center">
          <Row className="flex-1 flex-wrap gap-x-1">
            <span>
              🎉 You've got{' '}
              <span className="font-semibold">{remaining} free questions</span>!
            </span>
            <span>
              (Expires in{' '}
              {simpleFromNow(
                user.createdTime + DAY_MS * DAYS_TO_USE_FREE_QUESTIONS
              )}
              .)
            </span>
          </Row>
          <CreateQuestionButton
            className={'flex-1'}
            color="indigo-outline"
            size="xs"
          />
        </Col>
      )}

      <Row className="bg-canvas-50 sticky top-8 z-50 mb-2 w-full justify-between">
        <ControlledTabs
          className="mb-1"
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
        <DailyStats className="mr-1 sm:mr-2" user={user} />
      </Row>

      {privateUser && (
        <FeedTimeline
          className={clsx(activeIndex !== 0 && 'hidden', 'sm:px-2')}
          user={user}
          privateUser={privateUser}
        />
      )}
      {user && !user.shouldShowWelcome && (
        <BrowseSection
          className={clsx(activeIndex !== 1 && 'hidden')}
          privateUser={privateUser}
          user={user}
        />
      )}
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
    'for-you',
    'home-browse'
  )
  const shouldFilterDestiny = useShouldBlockDestiny(user?.id)
  const userTrendingTopics = useUserTrendingTopics(user, 25)

  return (
    <Col className={clsx('w-full max-w-full', className)}>
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
              DESTINY_GROUP_SLUG != topicSlug &&
              DESTINY_GROUP_SLUG
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
