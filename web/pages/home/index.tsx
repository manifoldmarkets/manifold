import { PencilAltIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { CPMMContract } from 'common/contract'
import { BACKGROUND_COLOR } from 'common/envs/constants'
import Router from 'next/router'
import { memo, ReactNode } from 'react'
import {
  ActivityLog,
  LivePillOptions,
  pill_options,
} from 'web/components/activity-log'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import GoToIcon from 'web/lib/icons/go-to-icon'
import { track } from 'web/lib/service/analytics'

import { useIsClient } from 'web/hooks/use-is-client'
import { ContractsFeed } from 'web/components/contract/contracts-feed'
import { ProbChangeTable } from 'web/components/contract/prob-change-table'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { TopicSelector } from 'web/components/topic-selector'
import ShortToggle from 'web/components/widgets/short-toggle'
import { FeedTimeline } from 'web/pages/feed-timeline'
import { NewsTopicsTabs } from 'web/components/news-topics-tabs'
import { DailyStats } from 'web/components/daily-stats'
import { Spacer } from 'web/components/layout/spacer'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import { useUser } from 'web/hooks/use-user'
import { useIsFeedTest } from 'web/hooks/use-is-feed-test'
import QuestionsHome from '../questions-home'

export default function Home() {
  const isClient = useIsClient()

  useRedirectIfSignedOut()
  useSaveReferral()
  useTracking('view home', { kind: 'desktop' })

  if (!isClient)
    return (
      <Page>
        <LoadingIndicator className="mt-6" />
      </Page>
    )

  return <HomeDashboard />
}

function HomeDashboard() {
  const isFeed = useIsFeedTest()
  const user = useUser()

  if (!isFeed) return <QuestionsHome />

  return (
    <Page>
      <Row className="mx-4 mb-2 items-center justify-between gap-4">
        <div className="flex sm:hidden">
          {user ? <ProfileSummary user={user} /> : <Spacer w={4} />}
        </div>
        <DailyStats user={user} />
      </Row>
      <NewsTopicsTabs
        homeContent={
          <Col className={clsx('gap-6')}>
            <FeedTimeline />
          </Col>
        }
      />
    </Page>
  )
}

const YourDailyUpdates = memo(function YourDailyUpdates(props: {
  contracts: CPMMContract[] | undefined
}) {
  const { contracts } = props
  const changedContracts = contracts
    ? contracts.filter((c) => Math.abs(c.probChanges?.day ?? 0) >= 0.01)
    : undefined
  if (!changedContracts || changedContracts.length === 0) return <></>

  return (
    <Col>
      <HomeSectionHeader
        label="Today's updates"
        icon="📊"
        href="/todays-updates"
      />
      <ProbChangeTable changes={changedContracts as CPMMContract[]} />
    </Col>
  )
})

function HomeSectionHeader(props: {
  label: string
  href?: string
  children?: ReactNode
  icon?: string
}) {
  const { label, href, children, icon } = props

  return (
    <Row
      className={clsx(
        'text-ink-900 sticky top-0 z-20 items-center justify-between px-1 pb-3 sm:px-0',
        BACKGROUND_COLOR
      )}
    >
      {icon != null && <div className="mr-2 inline">{icon}</div>}
      {href ? (
        <SiteLink
          className="flex-1 text-lg md:text-xl"
          href={href}
          onClick={() => track('home click section header', { section: href })}
        >
          {label}
          <GoToIcon className="text-ink-400 mb-1 ml-2 inline h-5 w-5" />
        </SiteLink>
      ) : (
        <div className="flex-1 text-lg md:text-xl">{label}</div>
      )}
      {children}
    </Row>
  )
}

const LiveSection = memo(function LiveSection(props: {
  pill: pill_options
  className?: string
}) {
  const { pill, className } = props
  return (
    <Col className={clsx('relative mt-4', className)}>
      <ActivityLog count={30} pill={pill} />
      <div className="from-canvas-50 pointer-events-none absolute bottom-0 h-5 w-full select-none bg-gradient-to-t to-transparent" />
    </Col>
  )
})

const YourFeedSection = memo(function YourFeedSection(props: {
  topic: string
  className?: string
}) {
  const { topic, className } = props

  return (
    <Col className={className}>
      <ContractsFeed topic={topic} />
    </Col>
  )
})

const MainContent = () => {
  const [topic, setTopic] = usePersistentLocalState('', 'your-feed-topic')
  const [isLive, setIsLive] = usePersistentInMemoryState(
    false,
    'main-content-section-is-live'
  )
  const [pill, setPill] = usePersistentInMemoryState<pill_options>(
    'all',
    'live-pill'
  )
  const selectLive = (on: boolean) => {
    setIsLive(on)
    track('select live', { on })
  }
  return (
    <Col>
      <Row className="h-[48px] items-center justify-between">
        {isLive ? (
          <LivePillOptions pill={pill} setPill={setPill} />
        ) : (
          <TopicSelector onSetTopic={setTopic} topic={topic} />
        )}
        <Row className="items-center gap-3">
          Live
          <ShortToggle on={isLive} setOn={selectLive} />
        </Row>
      </Row>
      <YourFeedSection topic={topic} className={clsx(isLive ? 'hidden' : '')} />
      {isLive && <LiveSection pill={pill} />}
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
