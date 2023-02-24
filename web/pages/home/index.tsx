import { PencilAltIcon, SwitchHorizontalIcon } from '@heroicons/react/solid'
import { isArray, keyBy } from 'lodash'
import clsx from 'clsx'

import { Contract, CPMMBinaryContract, CPMMContract } from 'common/contract'
import { BACKGROUND_COLOR } from 'common/envs/constants'
import { GlobalConfig } from 'common/globalConfig'
import { Group } from 'common/group'
import { Post } from 'common/post'
import Router from 'next/router'
import { memo, ReactNode, useEffect } from 'react'
import { ActivityLog } from 'web/components/activity-log'
import { Sort } from 'web/components/contract-search'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { DailyStats } from 'web/components/daily-stats'
import { PinnedItems } from 'web/components/groups/group-post-section'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { useTrendingGroups } from 'web/hooks/use-group'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useAllPosts } from 'web/hooks/use-post'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { updateGlobalConfig } from 'web/lib/firebase/globalConfig'
import { getGroup } from 'web/lib/firebase/groups'
import { getPost } from 'web/lib/firebase/posts'
import { updateUser } from 'web/lib/firebase/users'
import GoToIcon from 'web/lib/icons/go-to-icon'
import { track } from 'web/lib/service/analytics'
import { Title } from 'web/components/widgets/title'
import {
  MobileSearchButton,
  SearchButton,
} from 'web/components/nav/search-button'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useIsClient } from 'web/hooks/use-is-client'
import { ContractsFeed } from '../../components/contract/contracts-feed'
import { Swipe } from 'web/components/swipe/swipe'
import { getIsNative } from 'web/lib/native/is-native'
import {
  useYourDailyChangedContracts,
  useYourTrendingContracts,
} from 'web/hooks/use-your-daily-changed-contracts'
import { db } from '../../lib/supabase/db'
import { ProbChangeTable } from 'web/components/contract/prob-change-table'
import { safeLocalStorage } from 'web/lib/util/local'
import { filterDefined } from 'common/util/array'
import { ContractsList } from 'web/components/contract/contracts-list'

export default function Home() {
  const isClient = useIsClient()
  const isMobile = useIsMobile()
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

export function HomeDashboard() {
  const user = useUser()
  useRedirectIfSignedOut()
  useSaveReferral()

  const { sections } = getHomeItems(user?.homeSections ?? [])

  useEffect(() => {
    if (user && !user.homeSections && sections.length > 0) {
      // Save initial home sections.
      updateUser(user.id, { homeSections: sections.map((s) => s.id) })
    }
  }, [user, sections])

  return (
    <Page>
      <Col className="w-full max-w-2xl gap-4 py-2 pb-8 sm:px-2 lg:pr-4">
        <Row className={'mb-2 w-full items-center justify-between gap-4'}>
          <Title children="Home" className="!my-0 hidden sm:block" />
          <SearchButton className="hidden flex-1 md:flex lg:hidden" />
          <MobileSearchButton className="flex-1 md:hidden" />
          <DailyStats user={user} />
        </Row>

        <DailyMoversSection />
        <ActivitySection />

        <Col>
          <HomeSectionHeader label={'Your feed'} icon={'📖'} />
          <ContractsFeed />
        </Col>
      </Col>

      <button
        type="button"
        className="fixed bottom-[70px] right-3 z-20 inline-flex items-center rounded-full border border-transparent bg-indigo-600 p-4 text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 lg:hidden"
        onClick={() => {
          Router.push('/create')
          track('mobile create button')
        }}
      >
        <PencilAltIcon className="h-7 w-7" aria-hidden="true" />
      </button>
    </Page>
  )
}

const HOME_SECTIONS = [
  { label: "Today's updates", id: 'daily-movers', icon: '📊' },
  { label: 'Trending', id: 'score', icon: '🔥' },
  // { label: 'Daily changed', id: 'daily-trending', icon: '📈' },
  // { label: 'Featured', id: 'featured', icon: '📌' },
  // { label: 'New', id: 'newest', icon: '🗞️' },
  { label: 'Live feed', id: 'live-feed', icon: '🔴' },
] as const

export const getHomeItems = (sections: string[]) => {
  // Accommodate old home sections.
  if (!isArray(sections)) sections = []

  const itemsById = keyBy(HOME_SECTIONS, 'id')
  const sectionItems = filterDefined(sections.map((id) => itemsById[id]))

  // Add unmentioned items to the start.
  sectionItems.unshift(
    ...HOME_SECTIONS.filter((item) => !sectionItems.includes(item))
  )

  return {
    sections: sectionItems,
    itemsById,
  }
}

export function renderSections(
  sections: { id: string; label: string; icon?: string }[]
) {
  type sectionTypes = typeof HOME_SECTIONS[number]['id']

  return (
    <>
      {sections.map((s) => {
        const { id } = s as {
          id: sectionTypes
          label: string
          icon: string | undefined
        }

        if (id === 'daily-movers') return <DailyMoversSection key={id} />
        if (id === 'score') return <YourTrendingSection key={id} />
        if (id === 'live-feed') return <ActivitySection key={id} />
      })}
    </>
  )
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
        'sticky top-0 z-20 my-1 mx-2 items-center justify-between pb-2 pl-1 text-gray-900 lg:-ml-1',
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
          <GoToIcon className="mb-1 ml-2 inline h-5 w-5 text-gray-400" />
        </SiteLink>
      ) : (
        <div className="flex-1 text-lg md:text-xl">{label}</div>
      )}
      {children}
    </Row>
  )
}

export const SearchSection = memo(function SearchSection(props: {
  label: string
  contracts: CPMMBinaryContract[]
  sort: Sort
  pill?: string
  icon?: string
}) {
  const { label, contracts, sort, pill, icon } = props

  return (
    <Col>
      <HomeSectionHeader
        label={label}
        href={`/search?s=${sort}${pill ? `&p=${pill}` : ''}`}
        icon={icon}
      />
      <ContractsGrid contracts={contracts} showImageOnTopContract={true} />
    </Col>
  )
})

export function FeaturedSection(props: {
  globalConfig: GlobalConfig
  pinned: JSX.Element[]
  isAdmin: boolean
}) {
  const { globalConfig, pinned, isAdmin } = props
  const posts = useAllPosts()
  const groups = useTrendingGroups()

  async function onSubmit(selectedItems: { itemId: string; type: string }[]) {
    if (globalConfig == null) return
    const pinnedItems = await Promise.all(
      selectedItems
        .map(async (item) => {
          if (item.type === 'post') {
            const post = await getPost(item.itemId)
            if (post == null) return null

            return { item: post, type: 'post' }
          } else if (item.type === 'contract') {
            const contract = await getContractFromId(item.itemId)
            if (contract == null) return null

            return { item: contract, type: 'contract' }
          } else if (item.type === 'group') {
            const group = await getGroup(item.itemId)
            if (group == null) return null
            return { item: group, type: 'group' }
          }
        })
        .filter((item) => item != null)
    )
    await updateGlobalConfig(globalConfig, {
      pinnedItems: [
        ...(globalConfig?.pinnedItems ?? []),
        ...(pinnedItems as {
          item: Contract | Post | Group
          type: 'contract' | 'post' | 'group'
        }[]),
      ],
    })
  }

  function onDeleteClicked(index: number) {
    if (globalConfig == null) return
    const newPinned = globalConfig.pinnedItems.filter((item) => {
      return item.item.id !== globalConfig.pinnedItems[index].item.id
    })
    updateGlobalConfig(globalConfig, { pinnedItems: newPinned })
  }

  return (
    <Col className="relative">
      <HomeSectionHeader label={'Featured'} icon={'📌'} />
      <PinnedItems
        posts={posts}
        isEditable={isAdmin}
        pinned={pinned}
        onDeleteClicked={onDeleteClicked}
        onSubmit={onSubmit}
        modalMessage={'Pin posts or markets to the overview of this group.'}
        groups={groups}
      />
    </Col>
  )
}

export const ActivitySection = memo(function ActivitySection() {
  return (
    <Col>
      <HomeSectionHeader label="Live feed" href="/live" icon="🔴" />
      <div className="relative h-[700px] flex-none overflow-hidden">
        <ActivityLog count={10} showPills className="absolute" />
      </div>
    </Col>
  )
})

export const DailyMoversSection = memo(function DailyMoversSection() {
  const user = useUser()
  const contracts = useYourDailyChangedContracts(db, user?.id)

  if (contracts?.length === 0) return <></>

  return (
    <Col>
      <HomeSectionHeader label="Today's updates" icon="📊" />
      <ProbChangeTable changes={contracts as CPMMContract[]} />
    </Col>
  )
})

export const YourTrendingSection = memo(function YourTrendingSection() {
  const user = useUser()
  const contracts = useYourTrendingContracts(db, user?.id, 7)
  return (
    <Col>
      <HomeSectionHeader label={'Your trending'} icon={'🔥'} />
      <ContractsList contracts={contracts} skinny />
    </Col>
  )
})

function MobileHome() {
  const user = useUser()
  const { showSwipe, toggleView, isNative } = useViewToggle()

  if (showSwipe) return <Swipe toggleView={toggleView(false)} />

  return (
    <Page>
      <Col className="gap-4 py-2 pb-8 sm:px-2">
        <Row className="mx-4 mb-2 items-center justify-between gap-4">
          <MobileSearchButton className="flex-1" />
          <Row className="items-center gap-4">
            <DailyStats user={user} />
            {isNative && (
              <SwitchHorizontalIcon
                className="h-5 w-5"
                onClick={toggleView(true)}
              />
            )}
          </Row>
        </Row>

        <DailyMoversSection />
        <ContractsFeed />
      </Col>

      <button
        type="button"
        className={clsx(
          'fixed bottom-[70px] right-3 z-20 inline-flex items-center rounded-full border border-transparent  p-4  shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 lg:hidden',
          'from-indigo-500 to-blue-500 text-white hover:from-indigo-700 hover:to-blue-700 enabled:bg-gradient-to-r disabled:bg-gray-300'
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

  const defaultShowSwipe =
    typeof window === 'undefined'
      ? false
      : safeLocalStorage?.getItem('show-swipe')
      ? safeLocalStorage?.getItem('show-swipe') === 'true'
      : isNative

  const [showSwipe, setShowSwipe] = usePersistentState(defaultShowSwipe, {
    key: 'show-swipe',
    store: storageStore(safeLocalStorage),
  })

  const toggleView = (showSwipe: boolean) => () => {
    setShowSwipe(showSwipe)
    track('toggle swipe', { showSwipe })
  }
  return { showSwipe, toggleView, isNative }
}
