import { PlusCircleIcon } from '@heroicons/react/outline'
import {
  DotsVerticalIcon,
  PencilAltIcon,
  SwitchVerticalIcon,
} from '@heroicons/react/solid'
import { difference, isArray, keyBy } from 'lodash'
import clsx from 'clsx'

import { Contract, CPMMBinaryContract } from 'common/contract'
import {
  BACKGROUND_COLOR,
  DESTINY_GROUP_SLUGS,
  HOME_BLOCKED_GROUP_SLUGS,
} from 'common/envs/constants'
import { GlobalConfig } from 'common/globalConfig'
import { Group } from 'common/group'
import { Post } from 'common/post'
import { PrivateUser, User } from 'common/user'
import { buildArray, filterDefined } from 'common/util/array'
import { chooseRandomSubset } from 'common/util/random'
import { MINUTE_MS } from 'common/util/time'
import Router, { SingletonRouter } from 'next/router'
import { memo, ReactNode, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ActivityLog } from 'web/components/activity-log'
import { PillButton } from 'web/components/buttons/pill-button'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Sort } from 'web/components/contract-search'
import { ContractCard } from 'web/components/contract/contract-card'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { DailyStats } from 'web/components/daily-stats'
import { PinnedItems } from 'web/components/groups/group-post-section'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { PostCard } from 'web/components/posts/post-card'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { useAdmin } from 'web/hooks/use-admin'
import {
  useContractsByDailyScore,
  useNewContracts,
  useTrendingContracts,
} from 'web/hooks/use-contracts'
import { useGlobalConfig } from 'web/hooks/use-global-config'
import {
  useMemberGroupsIdsAndSlugs,
  useTrendingGroups,
} from 'web/hooks/use-group'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useAllPosts } from 'web/hooks/use-post'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { getContractFromId } from 'web/lib/firebase/contracts'
import {
  getGlobalConfig,
  updateGlobalConfig,
} from 'web/lib/firebase/globalConfig'
import { getGroup, joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { getPost } from 'web/lib/firebase/posts'
import { getUsersBlockFacetFilters, updateUser } from 'web/lib/firebase/users'
import GoToIcon from 'web/lib/icons/go-to-icon'
import HomeSettingsIcon from 'web/lib/icons/home-settings-icon'
import { track } from 'web/lib/service/analytics'
import { GroupCard } from '../groups'
import { useFeed } from 'web/hooks/use-feed'
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
import { safeLocalStorage } from 'web/lib/util/local'

export async function getStaticProps() {
  const globalConfig = await getGlobalConfig()

  return {
    props: { globalConfig },
    revalidate: 60, // regenerate after a minute
  }
}

export default function Home(props: { globalConfig: GlobalConfig }) {
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
  return <HomeDashboard globalConfig={props.globalConfig} />
}

export function HomeDashboard(props: { globalConfig: GlobalConfig }) {
  const user = useUser()
  const privateUser = usePrivateUser()
  const followedGroupIds = useMemberGroupsIdsAndSlugs(user?.id)
  const shouldFilterDestiny = !followedGroupIds?.find((g) =>
    DESTINY_GROUP_SLUGS.includes(g.slug)
  )
  const userBlockFacetFilters = useMemo(() => {
    if (!privateUser) return undefined
    const followedGroupSlugs = followedGroupIds?.map((g) => g.slug) ?? []

    const destinyFilters = shouldFilterDestiny
      ? DESTINY_GROUP_SLUGS.map((slug) => `groupSlugs:-${slug}`)
      : []
    const homeBlockedFilters = difference(
      HOME_BLOCKED_GROUP_SLUGS,
      followedGroupSlugs
    ).map((slug) => `groupSlugs:-${slug}`)
    return buildArray(
      getUsersBlockFacetFilters(privateUser),
      destinyFilters,
      homeBlockedFilters
    )
  }, [privateUser, followedGroupIds, shouldFilterDestiny])

  const isAdmin = useAdmin()
  const globalConfig = useGlobalConfig() ?? props.globalConfig
  useRedirectIfSignedOut()

  useSaveReferral()

  const { sections } = getHomeItems(user?.homeSections ?? [])

  useEffect(() => {
    if (user && !user.homeSections && sections.length > 0) {
      // Save initial home sections.
      updateUser(user.id, { homeSections: sections.map((s) => s.id) })
    }
  }, [user, sections])

  const trending = useTrendingContracts(
    12,
    userBlockFacetFilters,
    !!userBlockFacetFilters
  )

  // Change seed every 15 minutes.
  const seed = Math.round(Date.now() / (15 * MINUTE_MS)).toString()
  const trendingContracts = trending
    ? chooseRandomSubset(trending, 6, seed)
    : undefined

  const newContracts = useNewContracts(
    6,
    userBlockFacetFilters,
    !!userBlockFacetFilters
  )
  const dailyTrendingContracts = useContractsByDailyScore(
    6,
    userBlockFacetFilters,
    !!userBlockFacetFilters
  )

  const pinned = useGlobalPinned(globalConfig, privateUser)

  const isLoading =
    !user ||
    !privateUser ||
    !trendingContracts ||
    !newContracts ||
    !dailyTrendingContracts ||
    !globalConfig ||
    !pinned

  return (
    <Page>
      <Col className="gap-4 py-2 pb-8 sm:px-2">
        <Row className={'mb-2 w-full items-center justify-between gap-4'}>
          <Title children="Home" className="!my-0 hidden sm:block" />
          <SearchButton className="hidden flex-1 md:flex lg:hidden" />
          <MobileSearchButton className="flex-1 md:hidden" />
          <Row className="items-center gap-4">
            <DailyStats user={user} showLoans />
            <CustomizeButton router={Router} />
          </Row>
        </Row>

        {isLoading ? (
          <LoadingIndicator />
        ) : (
          <>
            {renderSections(
              sections,
              {
                score: trendingContracts,
                newest: newContracts,
                'daily-trending': dailyTrendingContracts,
              },
              isAdmin,
              globalConfig,
              pinned
            )}

            <HomeSectionHeader label={'Your feed'} icon={'📖'} />
            <ContractsFeed />
          </>
        )}
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
  { label: 'Trending', id: 'score', icon: '🔥' },
  { label: 'Daily changed', id: 'daily-trending', icon: '📈' },
  { label: 'Featured', id: 'featured', icon: '📌' },
  { label: 'New', id: 'newest', icon: '🗞️' },
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
  sections: { id: string; label: string; icon?: string }[],
  sectionContracts: {
    'daily-trending': CPMMBinaryContract[]
    newest: CPMMBinaryContract[]
    score: CPMMBinaryContract[]
  },
  isAdmin: boolean,
  globalConfig: GlobalConfig,
  pinned: JSX.Element[]
) {
  type sectionTypes = typeof HOME_SECTIONS[number]['id']

  return (
    <>
      {sections.map((s) => {
        const { id, label, icon } = s as {
          id: sectionTypes
          label: string
          icon: string | undefined
        }
        if (id === 'featured')
          return (
            <FeaturedSection
              key={id}
              globalConfig={globalConfig}
              pinned={pinned}
              isAdmin={isAdmin}
            />
          )

        if (id === 'live-feed') return <ActivitySection key={id} />

        const contracts = sectionContracts[id]

        if (id === 'daily-trending') {
          return (
            <SearchSection
              key={id}
              label={label}
              contracts={contracts}
              sort="daily-score"
              icon={icon}
            />
          )
        }
        return (
          <SearchSection
            key={id}
            label={label}
            contracts={contracts}
            sort={id as Sort}
            icon={icon}
          />
        )
      })}
    </>
  )
}

export const DiscoverFeed = (props: { user: User }) => {
  const { user } = props
  const { contracts, loadMore } = useFeed(user, 'home')

  if (!contracts) return <LoadingIndicator />
  return (
    <ContractsGrid
      contracts={contracts}
      showImageOnTopContract
      trackCardViews={true}
      loadMore={loadMore}
    />
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
        'sticky top-0 z-20 my-1 -ml-1 items-center justify-between pb-2 pl-1 text-gray-900',
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
      <div className="h-[700px] flex-none overflow-hidden">
        <ActivityLog count={10} showPills />
      </div>
    </Col>
  )
})

export const TrendingGroupsSection = memo(
  function TrendingGroupsSection(props: {
    user: User
    followedGroupIds: { id: string; slug: string }[]
    className?: string
  }) {
    const { user, followedGroupIds, className } = props

    const trendingGroups = useTrendingGroups()

    const myGroupIds = new Set(followedGroupIds.map((g) => g.id))

    const groups = trendingGroups.filter((g) => !myGroupIds.has(g.id))
    const count = 20
    const chosenGroups = groups.slice(0, count)

    if (chosenGroups.length === 0) {
      return null
    }

    return (
      <Col className={className}>
        <HomeSectionHeader
          label="Trending groups"
          href="/explore-groups"
          icon="👥"
        />
        <div className="mb-4 text-gray-500">
          Follow groups you are interested in.
        </div>
        <Row className="flex-wrap gap-2">
          {chosenGroups.map((g) => (
            <PillButton
              className="flex flex-row items-center gap-1"
              key={g.id}
              selected={myGroupIds.has(g.id)}
              onSelect={() => {
                if (myGroupIds.has(g.id)) leaveGroup(g.id, user.id)
                else {
                  const homeSections = (user.homeSections ?? [])
                    .filter((id) => id !== g.id)
                    .concat(g.id)
                  updateUser(user.id, { homeSections })

                  toast.promise(joinGroup(g.id, user.id), {
                    loading: 'Following group...',
                    success: `Followed ${g.name}`,
                    error: "Couldn't follow group, try again?",
                  })

                  track('home follow group', { group: g.slug })
                }
              }}
            >
              <PlusCircleIcon
                className={'h-5 w-5 flex-shrink-0 text-gray-500'}
                aria-hidden="true"
              />

              {g.name}
            </PillButton>
          ))}
        </Row>
      </Col>
    )
  }
)

function CustomizeButton(props: {
  router: SingletonRouter
  className?: string
}) {
  const { router, className } = props
  return (
    <DropdownMenu
      Items={[
        {
          name: 'Customize Home',
          icon: <HomeSettingsIcon className="h-5 w-5" />,
          onClick: () => {
            router.push('/home/edit')
          },
        },
      ]}
      Icon={<DotsVerticalIcon className={clsx('my-1 h-4 w-4', className)} />}
      menuWidth="w-44"
    />
  )
}

const useGlobalPinned = (
  globalConfig: GlobalConfig,
  privateUser: PrivateUser | null | undefined
) => {
  const [pinned, setPinned] = usePersistentState<JSX.Element[] | null>(null, {
    store: inMemoryStore(),
    key: 'home-pinned',
  })

  useEffect(() => {
    const pinnedItems = globalConfig?.pinnedItems
    const userIsBlocked = (userId: string) =>
      privateUser?.blockedUserIds.includes(userId) ||
      privateUser?.blockedByUserIds.includes(userId)
    if (pinnedItems) {
      const itemComponents = pinnedItems.map((element) => {
        if (element?.type === 'post') {
          const post = element.item as Post
          if (!userIsBlocked(post.creatorId))
            return <PostCard post={post} pinned={true} />
        } else if (element?.type == 'group') {
          const group = element.item as Group
          if (!userIsBlocked(group.creatorId))
            return <GroupCard group={group} pinned={true} />
        } else if (element?.type === 'contract') {
          const contract = element.item as Contract
          if (
            !userIsBlocked(contract.creatorId) &&
            !privateUser?.blockedContractIds.includes(contract.id) &&
            !privateUser?.blockedGroupSlugs.some((slug) =>
              contract.groupSlugs?.includes(slug)
            )
          )
            return <ContractCard contract={contract} pinned={true} />
        }
      })
      setPinned(
        itemComponents.filter(
          (element) => element != undefined
        ) as JSX.Element[]
      )
    }
  }, [
    globalConfig,
    privateUser?.blockedByUserIds,
    privateUser?.blockedContractIds,
    privateUser?.blockedGroupSlugs,
    privateUser?.blockedUserIds,
    setPinned,
  ])
  return pinned
}

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
              <SwitchVerticalIcon
                className="h-5 w-5"
                onClick={toggleView(true)}
              />
            )}
          </Row>
        </Row>

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
  const savedShowSwipe =
    typeof window === 'undefined'
      ? undefined
      : safeLocalStorage?.getItem('show-swipe') === 'true'

  const [showSwipe, setShowSwipe] = useState(!!savedShowSwipe)

  const [isNative, setIsNative] = useState(getIsNative())

  const update = (value: boolean) => {
    setShowSwipe(value)
    safeLocalStorage?.setItem('show-swipe', value.toString())
  }

  useEffect(() => {
    setIsNative(getIsNative())

    if (savedShowSwipe === undefined) {
      const loadedShowSwipe = safeLocalStorage?.getItem('show-swipe')
      if (loadedShowSwipe === 'true' || loadedShowSwipe === 'false') {
        update(loadedShowSwipe === 'true')
        return
      }

      const isNative = getIsNative()
      update(isNative)
    }
  }, [])

  const toggleView = (showSwipe: boolean) => () => {
    update(showSwipe)
    track('toggle swipe', { showSwipe })
  }
  return { showSwipe, toggleView, isNative }
}
