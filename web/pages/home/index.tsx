import { PencilAltIcon, SwitchHorizontalIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { Contract, CPMMContract } from 'common/contract'
import { BACKGROUND_COLOR } from 'common/envs/constants'
import Router from 'next/router'
import { memo, ReactNode } from 'react'
import { ActivityLog } from 'web/components/activity-log'
import { DailyStats } from 'web/components/daily-stats'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import GoToIcon from 'web/lib/icons/go-to-icon'
import { track } from 'web/lib/service/analytics'
import { Title } from 'web/components/widgets/title'

import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useIsClient } from 'web/hooks/use-is-client'
import { ContractsFeed } from '../../components/contract/contracts-feed'
import { Swipe } from 'web/components/swipe/swipe'
import { getIsNative } from 'web/lib/native/is-native'
import { useYourDailyChangedContracts } from 'web/hooks/use-your-daily-changed-contracts'
import { db } from '../../lib/supabase/db'
import { ProbChangeTable } from 'web/components/contract/prob-change-table'
import { ContractCardNew } from 'web/components/contract/contract-card'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export default function Home() {
  const isClient = useIsClient()
  const isMobile = useIsMobile()

  useRedirectIfSignedOut()
  useSaveReferral()
  useTracking('view home', { kind: isMobile ? 'swipe' : 'desktop' })

  if (!isClient)
    return (
      <Page>
        <LoadingIndicator className="mt-6" />
      </Page>
    )

  if (isMobile) {
    return <MobileHome />
  }
  return <HomeDashboard />
}

function HomeDashboard() {
  const user = useUser()

  const dailyChangedContracts = useYourDailyChangedContracts(db, user?.id)

  const isLoading = !dailyChangedContracts

  return (
    <Page>
      <Col className="mx-auto w-full max-w-2xl gap-6 pb-8 sm:px-2 lg:pr-4">
        <Row className={'w-full items-center justify-between gap-4'}>
          <Title children="Home" className="!my-0" />
          <DailyStats user={user} />
        </Row>

        {isLoading && <LoadingIndicator />}

        <Col className={clsx('gap-6', isLoading && 'hidden')}>
          <YourDailyUpdates contracts={dailyChangedContracts} />
          <MainContent />
        </Col>
      </Col>
    </Page>
  )
}

function MobileHome() {
  const user = useUser()
  const { showSwipe, toggleView, isNative } = useViewToggle()

  const dailyChangedContracts = useYourDailyChangedContracts(db, user?.id)

  const isLoading = !dailyChangedContracts

  if (showSwipe) return <Swipe toggleView={toggleView(false)} />

  return (
    <Page>
      <Col className="gap-2 py-2 pb-8 sm:px-2">
        <Row className="mx-4 mb-2 items-center justify-between gap-4">
          <Row className="items-center gap-2">
            <Title children="Home" className="!my-0" />
            {isNative && (
              <SwitchHorizontalIcon
                className="h-5 w-5"
                onClick={toggleView(true)}
              />
            )}
          </Row>

          <Row className="items-center gap-4">
            <DailyStats user={user} />
          </Row>
        </Row>

        {isLoading && <LoadingIndicator />}
        <Col className={clsx('gap-6', isLoading && 'hidden')}>
          <YourDailyUpdates contracts={dailyChangedContracts} />
          <MainContent />
        </Col>
      </Col>

      <button
        type="button"
        className={clsx(
          'focus:ring-primary-500 fixed bottom-[70px] right-3 z-20 inline-flex items-center rounded-full border  border-transparent  p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 lg:hidden',
          'disabled:bg-ink-300 text-ink-0 from-primary-500 hover:from-primary-700 to-blue-500 hover:to-blue-700 enabled:bg-gradient-to-r'
        )}
        onClick={() => {
          Router.push('/create')
          track('mobile create button')
        }}
      >
        <PencilAltIcon className="h-6 w-6" aria-hidden="true" />
      </button>
    </Page>
  )
}

const useViewToggle = () => {
  const isNative = getIsNative()

  const [showSwipe, setShowSwipe] = usePersistentLocalState(false, 'show-swipe')

  const toggleView = (showSwipe: boolean) => () => {
    setShowSwipe(showSwipe)
    track('toggle swipe', { showSwipe })
  }
  return { showSwipe, toggleView, isNative }
}

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
      <HomeSectionHeader label="Today's updates" icon="📊" />
      <ProbChangeTable changes={changedContracts as CPMMContract[]} />
    </Col>
  )
})

const LiveSection = memo(function LiveSection(props: { className?: string }) {
  const { className } = props
  return (
    <Col className={clsx('relative mt-4', className)}>
      <ActivityLog count={30} showPills />
      <div className="from-canvas-50 pointer-events-none absolute bottom-0 h-5 w-full select-none bg-gradient-to-t to-transparent" />
    </Col>
  )
})

const YourFeedSection = memo(function YourFeedSection(props: {
  className?: string
}) {
  const { className } = props
  return (
    <Col className={className}>
      {/* <HomeSectionHeader label={'Your feed'} icon={'📖'} /> */}
      <ContractsFeed />
    </Col>
  )
})

const MainContent = () => {
  const [section, setSection] = usePersistentInMemoryState(
    0,
    'main-content-section'
  )

  return (
    <Col>
      <ChoicesToggleGroup
        className="mb-2 border-0"
        choicesMap={{
          'For you': 0,
          'Live feed': 1,
        }}
        currentChoice={section}
        setChoice={setSection as any}
        color="indigo"
      />

      <YourFeedSection className={clsx(section === 0 ? '' : 'hidden')} />
      <LiveSection className={clsx(section === 1 ? '' : 'hidden')} />
    </Col>
  )
}

export const ContractsSection = memo(function ContractsSection(props: {
  contracts: Contract[]
  label: string
  icon: string
  className?: string
}) {
  const { contracts, className } = props
  return (
    <Col className={className}>
      <Col className="max-w-2xl">
        {contracts.map((contract) => (
          <ContractCardNew key={contract.id} contract={contract} />
        ))}
      </Col>
    </Col>
  )
})
