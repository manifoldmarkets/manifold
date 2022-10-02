import React, { ReactNode, useEffect } from 'react'
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
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import {
  useMemberGroupIds,
  useMemberGroupsSubscription,
  useTrendingGroups,
} from 'web/hooks/use-group'
import { Button } from 'web/components/button'
import { Row } from 'web/components/layout/row'
import { ProbChangeTable } from 'web/components/contract/prob-change-table'
import { groupPath, joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { formatMoney } from 'common/util/format'
import { useProbChanges } from 'web/hooks/use-prob-changes'
import { calculatePortfolioProfit } from 'common/calculate-metrics'
import { hasCompletedStreakToday } from 'web/components/profile/betting-streak-modal'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { PillButton } from 'web/components/buttons/pill-button'
import { filterDefined } from 'common/util/array'
import { updateUser } from 'web/lib/firebase/users'
import { isArray, keyBy } from 'lodash'
import { usePrefetch } from 'web/hooks/use-prefetch'
import { CPMMBinaryContract } from 'common/contract'
import {
  useContractsByDailyScoreNotBetOn,
  useContractsByDailyScoreGroups,
  useTrendingContracts,
  useNewContracts,
} from 'web/hooks/use-contracts'
import { ProfitBadge } from 'web/components/profit-badge'
import { LoadingIndicator } from 'web/components/loading-indicator'

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

  const dailyMovers = useProbChanges({ bettorId: user?.id })
  const trendingContracts = useTrendingContracts(6)
  const newContracts = useNewContracts(6)
  const dailyTrendingContracts = useContractsByDailyScoreNotBetOn(user?.id, 6)

  const groups = useMemberGroupsSubscription(user)
  const groupContracts = useContractsByDailyScoreGroups(
    groups?.map((g) => g.slug)
  )

  const isLoading =
    !user ||
    !dailyMovers ||
    !trendingContracts ||
    !newContracts ||
    !dailyTrendingContracts

  return (
    <Page>
      <Toaster />

      <Col className="pm:mx-10 gap-4 px-4 pb-8 pt-4 sm:pt-0">
        <Row className={'mb-2 w-full items-center justify-between gap-8'}>
          <input
            type="text"
            placeholder={'Search'}
            className="input input-bordered w-full sm:flex"
            onClick={() => Router.push('/search')}
          />
          <CustomizeButton justIcon />
          <DailyStats user={user} />
        </Row>

        {isLoading ? (
          <LoadingIndicator />
        ) : (
          <>
            {renderSections(user, sections, {
              score: trendingContracts,
              newest: newContracts,
              'daily-trending': dailyTrendingContracts,
              'daily-movers': dailyMovers,
            })}

            <TrendingGroupsSection user={user} />

            {renderGroupSections(user, groups, groupContracts)}
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
  { label: 'Daily trending', id: 'daily-trending' },
  { label: 'Daily movers', id: 'daily-movers' },
  { label: 'Trending', id: 'score' },
  { label: 'New', id: 'newest' },
]

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
  user: User,
  sections: { id: string; label: string }[],
  sectionContracts: {
    'daily-movers': CPMMBinaryContract[]
    'daily-trending': CPMMBinaryContract[]
    newest: CPMMBinaryContract[]
    score: CPMMBinaryContract[]
  }
) {
  return (
    <>
      {sections.map((s) => {
        const { id, label } = s
        const contracts =
          sectionContracts[s.id as keyof typeof sectionContracts]

        if (id === 'daily-movers') {
          return <DailyMoversSection key={id} contracts={contracts} />
        }
        if (id === 'daily-trending') {
          return (
            <ContractsSection
              key={id}
              label={label}
              contracts={contracts}
              sort="daily-score"
              showProbChange
            />
          )
        }
        return (
          <ContractsSection
            key={id}
            label={label}
            contracts={contracts}
            sort={id === 'daily-trending' ? 'daily-score' : (id as Sort)}
          />
        )
      })}
    </>
  )
}

function renderGroupSections(
  user: User,
  groups: Group[] | undefined,
  groupContracts: Dictionary<CPMMBinaryContract[]> | undefined
) {
  if (!groups || !groupContracts) {
    return <LoadingIndicator />
  }

  const filteredGroups = groups.filter((g) => groupContracts[g.slug])
  const orderedGroups = sortBy(filteredGroups, (g) =>
    // Sort by sum of top two daily scores.
    sum(
      sortBy(groupContracts[g.slug].map((c) => c.dailyScore))
        .reverse()
        .slice(0, 2)
    )
  ).reverse()

  return (
    <>
      {orderedGroups.map((group) => {
        const contracts = groupContracts[group.slug].filter(
          (c) => Math.abs(c.probChanges.day) >= 0.01
        )
        if (contracts.length === 0) return null

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

function ContractsSection(props: {
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

function DailyMoversSection(props: { contracts: CPMMBinaryContract[] }) {
  const { contracts } = props

  const changes = contracts.filter((c) => Math.abs(c.probChanges.day) >= 0.01)

  if (changes.length === 0) {
    return null
  }

  return (
    <Col className="gap-2">
      <SectionHeader label="Daily movers" href="/daily-movers" />
      <ProbChangeTable changes={changes} />
    </Col>
  )
}

function DailyStats(props: {
  user: User | null | undefined
  className?: string
}) {
  const { user, className } = props

  const metrics = usePortfolioHistory(user?.id ?? '', 'daily') ?? []
  const [first, last] = [metrics[0], metrics[metrics.length - 1]]

  const privateUser = usePrivateUser()
  const streaks = privateUser?.notificationPreferences?.betting_streaks ?? []
  const streaksHidden = streaks.length === 0

  let profit = 0
  let profitPercent = 0
  if (first && last) {
    profit = calculatePortfolioProfit(last) - calculatePortfolioProfit(first)
    profitPercent = profit / first.investmentValue
  }

  return (
    <Row className={'flex-shrink-0 gap-4'}>
      <Col>
        <div className="text-gray-500">Daily profit</div>
        <Row className={clsx(className, 'items-center text-lg')}>
          <span>{formatMoney(profit)}</span>{' '}
          <ProfitBadge profitPercent={profitPercent * 100} />
        </Row>
      </Col>
      {!streaksHidden && (
        <Col>
          <div className="text-gray-500">Streak</div>
          <Row
            className={clsx(
              className,
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

export function TrendingGroupsSection(props: {
  user: User | null | undefined
  className?: string
}) {
  const { user, className } = props
  const memberGroupIds = useMemberGroupIds(user) || []

  const groups = useTrendingGroups().filter(
    (g) => !memberGroupIds.includes(g.id)
  )
  const count = 7
  const chosenGroups = groups.slice(0, count)

  if (chosenGroups.length === 0) {
    return null
  }

  return (
    <Col className={className}>
      <SectionHeader label="Trending groups" href="/explore-groups" />
      <Row className="flex-wrap gap-2">
        {chosenGroups.map((g) => (
          <PillButton
            className="flex flex-row items-center gap-1"
            key={g.id}
            selected={memberGroupIds.includes(g.id)}
            onSelect={() => {
              if (!user) return
              if (memberGroupIds.includes(g.id)) leaveGroup(g, user?.id)
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
