import React, { ReactNode, useEffect, useState } from 'react'
import Router from 'next/router'
import {
  AdjustmentsIcon,
  PencilAltIcon,
  ArrowSmRightIcon,
} from '@heroicons/react/solid'
import { PlusCircleIcon, XCircleIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { toast, Toaster } from 'react-hot-toast'
import { Dictionary, sortBy, sum } from 'lodash'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Sort } from 'web/components/contract-search'
import { Group } from 'common/group'
import { SiteLink } from 'web/components/site-link'
import {
  usePrivateUser,
  useUser,
  useUserContractMetricsByProfit,
} from 'web/hooks/use-user'
import {
  useMemberGroupsSubscription,
  useTrendingGroups,
} from 'web/hooks/use-group'
import { Button } from 'web/components/button'
import { Row } from 'web/components/layout/row'
import { ProfitChangeTable } from 'web/components/contract/prob-change-table'
import { groupPath, joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { formatMoney } from 'common/util/format'
import { ContractMetrics } from 'common/calculate-metrics'
import { hasCompletedStreakToday } from 'web/components/profile/betting-streak-modal'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { PillButton } from 'web/components/buttons/pill-button'
import { filterDefined } from 'common/util/array'
import { updateUser } from 'web/lib/firebase/users'
import { isArray, keyBy } from 'lodash'
import { usePrefetch } from 'web/hooks/use-prefetch'
import { Contract, CPMMBinaryContract } from 'common/contract'
import {
  useContractsByDailyScoreNotBetOn,
  useContractsByDailyScoreGroups,
  useTrendingContracts,
  useNewContracts,
} from 'web/hooks/use-contracts'
import { ProfitBadge } from 'web/components/profit-badge'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Input } from 'web/components/input'
import { PinnedItems } from 'web/components/groups/group-overview'
import { updateGlobalConfig } from 'web/lib/firebase/globalConfig'
import { getPost } from 'web/lib/firebase/posts'
import { PostCard } from 'web/components/post-card'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { ContractCard } from 'web/components/contract/contract-card'
import { Post } from 'common/post'
import { isAdmin } from 'common/envs/constants'
import { useAllPosts } from 'web/hooks/use-post'
import { useGlobalConfig } from 'web/hooks/use-global-config'

export default function Home() {
  const user = useUser()

  useTracking('view home')

  useSaveReferral()
  usePrefetch(user?.id)

  useEffect(() => {
    if (user === null) {
      // Go to landing page if not logged in.
      Router.push('/')
    }
  })

  const { sections } = getHomeItems(user?.homeSections ?? [])

  useEffect(() => {
    if (user && !user.homeSections && sections.length > 0) {
      // Save initial home sections.
      updateUser(user.id, { homeSections: sections.map((s) => s.id) })
    }
  }, [user, sections])

  const contractMetricsByProfit = useUserContractMetricsByProfit(
    user?.id ?? '_',
    3
  )

  const trendingContracts = useTrendingContracts(6)
  const newContracts = useNewContracts(6)
  const dailyTrendingContracts = useContractsByDailyScoreNotBetOn(user?.id, 6)

  const groups = useMemberGroupsSubscription(user)
  const trendingGroups = useTrendingGroups()
  const groupContracts = useContractsByDailyScoreGroups(
    groups?.map((g) => g.slug)
  )

  const isLoading =
    !user ||
    !contractMetricsByProfit ||
    !trendingContracts ||
    !newContracts ||
    !dailyTrendingContracts

  return (
    <Page>
      <Toaster />

      <Col className="pm:mx-10 gap-4 px-4 pb-8 pt-4 sm:pt-0">
        <Row
          className={'mb-2 w-full items-center justify-between gap-4 sm:gap-8'}
        >
          <Input
            type="text"
            placeholder={'Search'}
            className="w-full"
            onClick={() => Router.push('/search')}
          />
          <CustomizeButton justIcon />
          <DailyStats user={user} />
        </Row>

        {isLoading ? (
          <LoadingIndicator />
        ) : (
          <>
            {renderSections(sections, {
              score: trendingContracts,
              newest: newContracts,
              'daily-trending': dailyTrendingContracts,
              'daily-movers': contractMetricsByProfit,
            })}

            {groups && groupContracts && trendingGroups.length > 0 ? (
              <>
                <TrendingGroupsSection
                  className="mb-4"
                  user={user}
                  myGroups={groups}
                  trendingGroups={trendingGroups}
                />
                {renderGroupSections(user, groups, groupContracts)}
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
  { label: 'Featured', id: 'featured' },
  { label: 'Daily trending', id: 'daily-trending' },
  { label: 'Daily movers', id: 'daily-movers' },
  { label: 'Trending', id: 'score' },
  { label: 'New', id: 'newest' },
] as const

export const getHomeItems = (sections: string[]) => {
  // Accommodate old home sections.
  if (!isArray(sections)) sections = []

  const itemsById = keyBy(HOME_SECTIONS, 'id')
  const sectionItems = filterDefined(sections.map((id) => itemsById[id]))

  // Add new home section items to the top.
  sectionItems.unshift(
    ...HOME_SECTIONS.filter((item) => !sectionItems.includes(item))
  )
  // Add unmentioned items to the end.
  sectionItems.push(
    ...HOME_SECTIONS.filter((item) => !sectionItems.includes(item))
  )

  return {
    sections: sectionItems,
    itemsById,
  }
}

function renderSections(
  sections: { id: string; label: string }[],
  sectionContracts: {
    'daily-movers': {
      contracts: CPMMBinaryContract[]
      metrics: ContractMetrics[]
    }
    'daily-trending': CPMMBinaryContract[]
    newest: CPMMBinaryContract[]
    score: CPMMBinaryContract[]
  }
) {
  type sectionTypes = typeof HOME_SECTIONS[number]['id']

  return (
    <>
      {sections.map((s) => {
        const { id, label } = s as {
          id: sectionTypes
          label: string
        }
        if (id === 'daily-movers') {
          return <DailyMoversSection key={id} {...sectionContracts[id]} />
        }

        if (id === 'featured') {
          // For now, only admins can see the featured section, until we all agree its ship-ready
          if (!isAdmin()) return <></>
          return <FeaturedSection />
        }

        const contracts = sectionContracts[id]

        if (id === 'daily-trending') {
          return (
            <SearchSection
              key={id}
              label={label}
              contracts={contracts}
              sort="daily-score"
              showProbChange
            />
          )
        }
        return (
          <SearchSection
            key={id}
            label={label}
            contracts={contracts}
            sort={id as Sort}
          />
        )
      })}
    </>
  )
}

function renderGroupSections(
  user: User,
  groups: Group[],
  groupContracts: Dictionary<CPMMBinaryContract[]>
) {
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
}

function SectionHeader(props: {
  label: string
  href: string
  children?: ReactNode
}) {
  const { label, href, children } = props

  return (
    <Row className="mb-3 items-center justify-between">
      <SiteLink
        className="text-xl"
        href={href}
        onClick={() => track('home click section header', { section: href })}
      >
        {label}{' '}
        <ArrowSmRightIcon
          className="mb-0.5 inline h-6 w-6 text-gray-500"
          aria-hidden="true"
        />
      </SiteLink>
      {children}
    </Row>
  )
}

function SearchSection(props: {
  label: string
  contracts: CPMMBinaryContract[]
  sort: Sort
  pill?: string
  showProbChange?: boolean
}) {
  const { label, contracts, sort, pill, showProbChange } = props

  return (
    <Col>
      <SectionHeader
        label={label}
        href={`/search?s=${sort}${pill ? `&p=${pill}` : ''}`}
      />
      <ContractsGrid contracts={contracts} cardUIOptions={{ showProbChange }} />
    </Col>
  )
}

function FeaturedSection() {
  const [pinned, setPinned] = useState<JSX.Element[]>([])
  const posts = useAllPosts()
  const globalConfig = useGlobalConfig()

  useEffect(() => {
    const pinnedItems = globalConfig?.pinnedItems

    async function getPinned() {
      if (pinnedItems == null) {
        if (globalConfig != null) {
          updateGlobalConfig(globalConfig, { pinnedItems: [] })
        }
      } else {
        const itemComponents = await Promise.all(
          pinnedItems.map(async (element) => {
            if (element.type === 'post') {
              const post = await getPost(element.itemId)
              if (post) {
                return <PostCard post={post as Post} />
              }
            } else if (element.type === 'contract') {
              const contract = await getContractFromId(element.itemId)
              if (contract) {
                return <ContractCard contract={contract as Contract} />
              }
            }
          })
        )
        setPinned(
          itemComponents.filter(
            (element) => element != undefined
          ) as JSX.Element[]
        )
      }
    }
    getPinned()
  }, [globalConfig])

  async function onSubmit(selectedItems: { itemId: string; type: string }[]) {
    if (globalConfig == null) return
    await updateGlobalConfig(globalConfig, {
      pinnedItems: [
        ...(globalConfig?.pinnedItems ?? []),
        ...(selectedItems as { itemId: string; type: 'contract' | 'post' }[]),
      ],
    })
  }

  function onDeleteClicked(index: number) {
    if (globalConfig == null) return
    const newPinned = globalConfig.pinnedItems.filter((item) => {
      return item.itemId !== globalConfig.pinnedItems[index].itemId
    })
    updateGlobalConfig(globalConfig, { pinnedItems: newPinned })
  }

  return (
    <Col>
      <SectionHeader label={'Featured'} href={`#`} />
      <PinnedItems
        posts={posts}
        isEditable={true}
        pinned={pinned}
        onDeleteClicked={onDeleteClicked}
        onSubmit={onSubmit}
        modalMessage={'Pin posts or markets to the overview of this group.'}
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
      <SectionHeader label={group.name} href={groupPath(group.slug)}>
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
      </SectionHeader>
      <ContractsGrid
        contracts={contracts.slice(0, 4)}
        cardUIOptions={{ showProbChange: true }}
      />
    </Col>
  )
}

function DailyMoversSection(props: {
  contracts: CPMMBinaryContract[]
  metrics: ContractMetrics[]
}) {
  const { contracts, metrics } = props

  if (contracts.length === 0) {
    return null
  }

  return (
    <Col className="gap-2">
      <SectionHeader label="Daily movers" href="/daily-movers" />
      <ProfitChangeTable contracts={contracts} metrics={metrics} />
    </Col>
  )
}

function DailyStats(props: { user: User | null | undefined }) {
  const { user } = props

  const privateUser = usePrivateUser()
  const streaks = privateUser?.notificationPreferences?.betting_streaks ?? []
  const streaksHidden = streaks.length === 0

  return (
    <Row className={'flex-shrink-0 gap-4'}>
      <DailyProfit user={user} />
      {!streaksHidden && (
        <Col>
          <div className="text-gray-500">Streak</div>
          <Row
            className={clsx(
              'items-center text-lg',
              user && !hasCompletedStreakToday(user) && 'grayscale'
            )}
          >
            <span>🔥 {user?.currentBettingStreak ?? 0}</span>
          </Row>
        </Col>
      )}
    </Row>
  )
}

export function DailyProfit(props: { user: User | null | undefined }) {
  const { user } = props

  const contractMetricsByProfit = useUserContractMetricsByProfit(
    user?.id ?? '_',
    100
  )
  const profit = sum(
    contractMetricsByProfit?.metrics.map((m) =>
      m.from ? m.from.day.profit : 0
    ) ?? []
  )

  const metrics = usePortfolioHistory(user?.id ?? '', 'daily') ?? []
  const [first, last] = [metrics[0], metrics[metrics.length - 1]]

  let profitPercent = 0
  if (first && last) {
    // profit = calculatePortfolioProfit(last) - calculatePortfolioProfit(first)
    profitPercent = profit / first.investmentValue
  }

  return (
    <SiteLink className="flex flex-col" href="/daily-movers">
      <div className="text-gray-500">Daily profit</div>
      <Row className="items-center text-lg">
        <span>{formatMoney(profit)}</span>{' '}
        <ProfitBadge profitPercent={profitPercent * 100} />
      </Row>
    </SiteLink>
  )
}

export function TrendingGroupsSection(props: {
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
      <SectionHeader label="Trending groups" href="/explore-groups" />
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

function CustomizeButton(props: { justIcon?: boolean; className?: string }) {
  const { justIcon, className } = props
  return (
    <SiteLink
      className={clsx(
        className,
        'flex flex-row items-center text-xl hover:no-underline'
      )}
      href="/home/edit"
    >
      <Button size="lg" color="gray" className={clsx('flex gap-2')}>
        <AdjustmentsIcon
          className={clsx('h-[24px] w-5 text-gray-500')}
          aria-hidden="true"
        />
        {!justIcon && 'Customize'}
      </Button>
    </SiteLink>
  )
}
