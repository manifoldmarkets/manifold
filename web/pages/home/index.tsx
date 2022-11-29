import React, { memo, ReactNode, useEffect } from 'react'
import Router from 'next/router'
import { PencilAltIcon } from '@heroicons/react/solid'
import { PlusCircleIcon, XCircleIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { toast } from 'react-hot-toast'
import { Dictionary, sortBy, sum, sumBy } from 'lodash'
import { chooseRandomSubset } from 'common/util/random'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Sort } from 'web/components/contract-search'
import { Group, groupPath } from 'common/group'
import { SiteLink } from 'web/components/widgets/site-link'
import {
  usePrivateUser,
  useUser,
  useUserContractMetricsByProfit,
} from 'web/hooks/use-user'
import {
  useMemberGroupsSubscription,
  useTrendingGroups,
} from 'web/hooks/use-group'
import { Button, buttonClass } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { ProfitChangeTable } from 'web/components/contract/prob-change-table'
import { getGroup, joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { ContractMetric } from 'common/contract-metric'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { PillButton } from 'web/components/buttons/pill-button'
import { filterDefined } from 'common/util/array'
import { getUsersBlockFacetFilters, updateUser } from 'web/lib/firebase/users'
import { isArray, keyBy } from 'lodash'
import { usePrefetch } from 'web/hooks/use-prefetch'
import { Contract, CPMMBinaryContract } from 'common/contract'
import {
  useContractsByDailyScoreNotBetOn,
  useContractsByDailyScoreGroups,
  useTrendingContracts,
  useNewContracts,
} from 'web/hooks/use-contracts'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Input } from 'web/components/widgets/input'
import { PinnedItems } from 'web/components/groups/group-about'
import {
  getGlobalConfig,
  updateGlobalConfig,
} from 'web/lib/firebase/globalConfig'
import { getPost } from 'web/lib/firebase/posts'
import { PostCard } from 'web/components/posts/post-card'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { ContractCard } from 'web/components/contract/contract-card'
import { Post } from 'common/post'
import { useAllPosts } from 'web/hooks/use-post'
import { useGlobalConfig } from 'web/hooks/use-global-config'
import { useAdmin } from 'web/hooks/use-admin'
import { GlobalConfig } from 'common/globalConfig'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { ActivityLog } from 'web/components/activity-log'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import GoToIcon from 'web/lib/icons/go-to-icon'
import { DailyStats } from 'web/components/daily-stats'
import HomeSettingsIcon from 'web/lib/icons/home-settings-icon'
import { GroupCard } from '../groups'
import { BACKGROUND_COLOR, DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import Link from 'next/link'
import { MINUTE_MS } from 'common/util/time'
import { manaToUSD } from 'common/util/format'
import { getAllCharityTxns } from 'web/lib/firebase/txns'

export async function getStaticProps() {
  const globalConfig = await getGlobalConfig()

  const txns = await getAllCharityTxns()
  const totalRaised = sumBy(txns, 'amount') - 1113458

  return {
    props: { globalConfig, totalRaised },
    revalidate: 60, // regenerate after a minute
  }
}

export default function Home(props: {
  globalConfig: GlobalConfig
  totalRaised: number
}) {
  const user = useUser()
  const privateUser = usePrivateUser()
  const followedGroups = useMemberGroupsSubscription(user)
  const shouldFilterDestiny = !followedGroups?.find((g) =>
    DESTINY_GROUP_SLUGS.includes(g.slug)
  )
  const userBlockFacetFilters = getUsersBlockFacetFilters(privateUser).concat(
    shouldFilterDestiny
      ? DESTINY_GROUP_SLUGS.map((slug) => `groupSlugs:-${slug}`)
      : []
  )
  const isAdmin = useAdmin()
  const globalConfig = useGlobalConfig() ?? props.globalConfig
  useRedirectIfSignedOut()
  useTracking('view home')

  useSaveReferral()
  usePrefetch(user?.id)

  const { sections } = getHomeItems(user?.homeSections ?? [])

  useEffect(() => {
    if (user && !user.homeSections && sections.length > 0) {
      // Save initial home sections.
      updateUser(user.id, { homeSections: sections.map((s) => s.id) })
    }
  }, [user, sections])

  const trending = useTrendingContracts(12, userBlockFacetFilters)

  // Change seed every 15 minutes.
  const seed = Math.round(Date.now() / (15 * MINUTE_MS)).toString()
  const trendingContracts = trending
    ? chooseRandomSubset(trending, 6, seed)
    : undefined

  const newContracts = useNewContracts(6, userBlockFacetFilters)
  const dailyTrendingContracts = useContractsByDailyScoreNotBetOn(
    6,
    userBlockFacetFilters
  )
  const contractMetricsByProfit = useUserContractMetricsByProfit(
    user?.id ?? '_'
  )

  const trendingGroups = useTrendingGroups()
  const groupContracts = useContractsByDailyScoreGroups(
    followedGroups?.map((g) => g.slug),
    userBlockFacetFilters
  )

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
      <Col className="pm:mx-10 gap-4 px-4 pb-8 pt-4 sm:pt-0">
        <Row
          className={'mb-2 w-full items-center justify-between gap-2 sm:gap-8'}
        >
          <Row className="md:w-3/4">
            <Input
              type="text"
              placeholder={'Search Manifold'}
              className="w-full"
              onClick={() => Router.push('/search')}
              onChange={(e) => Router.push(`/search?q=${e.target.value}`)}
            />
            <CustomizeButton className="ml-1" />
          </Row>
          <DailyStats user={user} />
        </Row>

        <Link href="/charity">
          <div className="text-md flex flex-wrap items-center justify-between gap-1 rounded-lg bg-gradient-to-r from-pink-300 via-purple-400 to-indigo-400 p-4 font-semibold text-white sm:text-xl">
            <div>It's Giving Tuesday!</div>
            <div>
              <span className="mr-2 rounded-md bg-white px-2 text-gray-700">
                {manaToUSD(props.totalRaised)}
              </span>
              donated today
            </div>
            <GoToIcon className="hidden h-6 w-6 sm:inline" />
          </div>
        </Link>

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
              pinned,
              contractMetricsByProfit
            )}

            {followedGroups && groupContracts && trendingGroups.length > 0 ? (
              <>
                <TrendingGroupsSection
                  className="mb-4"
                  user={user}
                  myGroups={followedGroups}
                  trendingGroups={trendingGroups}
                />
                <GroupSections
                  user={user}
                  groups={followedGroups}
                  groupContracts={groupContracts}
                />
              </>
            ) : (
              <LoadingIndicator />
            )}
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
  { label: 'Your daily movers', id: 'daily-movers' },
  { label: 'Featured', id: 'featured', icon: '⭐' },
  { label: 'New', id: 'newest', icon: '✨' },
  { label: 'Live feed', id: 'live-feed', icon: '🔴' },
] as const

export const getHomeItems = (sections: string[]) => {
  // Accommodate old home sections.
  if (!isArray(sections)) sections = []

  const itemsById = keyBy(HOME_SECTIONS, 'id')
  const sectionItems = filterDefined(sections.map((id) => itemsById[id]))

  // Add unmentioned items to the end.
  sectionItems.push(
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
  pinned: JSX.Element[],
  dailyMovers:
    | {
        contracts: CPMMBinaryContract[]
        metrics: ContractMetric[]
      }
    | undefined
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
              key={'featured'}
              globalConfig={globalConfig}
              pinned={pinned}
              isAdmin={isAdmin}
            />
          )

        if (id === 'live-feed') return <ActivitySection key={id} />

        if (id === 'daily-movers') {
          return <DailyMoversSection key={id} data={dailyMovers} />
        }

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

const GroupSections = memo(function GroupSections(props: {
  user: User
  groups: Group[]
  groupContracts: Dictionary<CPMMBinaryContract[]>
}) {
  const { user, groups, groupContracts } = props
  const filteredGroups = groups.filter((g) => groupContracts[g.slug])
  const orderedGroups = sortBy(filteredGroups, (g) =>
    // Sort by sum of top two daily scores.
    sum(
      sortBy(groupContracts[g.slug].map((c) => c.dailyScore))
        .reverse()
        .slice(0, 2)
    )
  ).reverse()

  const previouslySeenContracts = new Set<string>()

  return (
    <>
      {orderedGroups.map((group) => {
        const contracts = groupContracts[group.slug].filter(
          (c) =>
            Math.abs(c.probChanges.day) >= 0.01 &&
            !previouslySeenContracts.has(c.id)
        )
        if (contracts.length === 0) return null

        contracts.forEach((c) => previouslySeenContracts.add(c.id))

        return (
          <GroupSection
            key={group.id}
            group={group}
            user={user}
            contracts={contracts}
          />
        )
      })}
    </>
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
      <HomeSectionHeader label={'Featured'} icon={'⭐'} />
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

function GroupSection(props: {
  group: Group
  user: User
  contracts: CPMMBinaryContract[]
}) {
  const { group, user, contracts } = props

  return (
    <Col>
      <HomeSectionHeader label={group.name} href={groupPath(group.slug)}>
        <Button
          color="gray-white"
          onClick={() => {
            const homeSections = (user.homeSections ?? []).filter(
              (id) => id !== group.id
            )
            updateUser(user.id, { homeSections })

            toast.promise(leaveGroup(group, user.id), {
              loading: 'Unfollowing group...',
              success: `Unfollowed ${group.name}`,
              error: "Couldn't unfollow group, try again?",
            })
          }}
        >
          <XCircleIcon className={'h-5 w-5 flex-shrink-0'} aria-hidden="true" />
        </Button>
      </HomeSectionHeader>
      <ContractsGrid
        contracts={contracts.slice(0, 4)}
        showImageOnTopContract={true}
      />
    </Col>
  )
}

export const DailyMoversSection = memo(function DailyMoversSection(props: {
  data:
    | {
        contracts: CPMMBinaryContract[]
        metrics: ContractMetric[]
      }
    | undefined
}) {
  const user = useUser()

  const { data } = props

  if (!user || !data) return null

  const { contracts, metrics } = data

  const hasProfit = metrics.some((m) => m.from && m.from.day.profit > 0)
  const hasLoss = metrics.some((m) => m.from && m.from.day.profit < 0)

  if (!hasProfit || !hasLoss) {
    return null
  }

  return (
    <Col className="gap-2">
      <HomeSectionHeader label="Your daily movers" href="/daily-movers" />
      <ProfitChangeTable contracts={contracts} metrics={metrics} maxRows={3} />
    </Col>
  )
})

export const ActivitySection = memo(function ActivitySection() {
  return (
    <Col>
      <HomeSectionHeader label="Live feed" href="/live" icon="🔴" />
      <ActivityLog count={6} showPills />
    </Col>
  )
})

export const TrendingGroupsSection = memo(
  function TrendingGroupsSection(props: {
    user: User
    myGroups: Group[]
    trendingGroups: Group[]
    className?: string
  }) {
    const { user, myGroups, trendingGroups, className } = props

    const myGroupIds = new Set(myGroups.map((g) => g.id))

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
                if (myGroupIds.has(g.id)) leaveGroup(g, user.id)
                else {
                  const homeSections = (user.homeSections ?? [])
                    .filter((id) => id !== g.id)
                    .concat(g.id)
                  updateUser(user.id, { homeSections })

                  toast.promise(joinGroup(g, user.id), {
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

function CustomizeButton(props: { className?: string }) {
  const { className } = props
  return (
    <Link
      className={clsx(className, buttonClass('xs', 'gray-white'))}
      href="/home/edit"
    >
      <HomeSettingsIcon className="h-7 w-7 text-gray-400" aria-hidden />
    </Link>
  )
}
