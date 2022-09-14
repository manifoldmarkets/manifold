import React, { ReactNode } from 'react'
import Router from 'next/router'
import {
  AdjustmentsIcon,
  PencilAltIcon,
  ArrowSmRightIcon,
  DotsHorizontalIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import Masonry from 'react-masonry-css'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch, SORTS } from 'web/components/contract-search'
import { User } from 'common/user'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Sort } from 'web/components/contract-search'
import { Group } from 'common/group'
import { SiteLink } from 'web/components/site-link'
import { useUser } from 'web/hooks/use-user'
import {
  useMemberGroupIds,
  useMemberGroups,
  useTrendingGroups,
} from 'web/hooks/use-group'
import { Button } from 'web/components/button'
import { getHomeItems } from '../../../components/arrange-home'
import { Title } from 'web/components/title'
import { Row } from 'web/components/layout/row'
import { ProbChangeTable } from 'web/components/contract/prob-change-table'
import { groupPath, leaveGroup } from 'web/lib/firebase/groups'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { formatMoney } from 'common/util/format'
import { useProbChanges } from 'web/hooks/use-prob-changes'
import { ProfitBadge } from 'web/components/bets-list'
import { calculatePortfolioProfit } from 'common/calculate-metrics'
import { GroupCard } from 'web/pages/groups'
import { chooseRandomSubset } from 'common/util/random'
import { MenuButton } from 'web/components/nav/menu'

export default function Home() {
  const user = useUser()

  useTracking('view home')

  useSaveReferral()

  const groups = useMemberGroups(user?.id) ?? []

  const { sections } = getHomeItems(groups, user?.homeSections ?? [])

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 px-4 pb-12 pt-2 sm:pt-0">
        <Row className={'w-full items-start justify-between gap-8'}>
          <Row className="items-end gap-4">
            <Title className="!mb-1 !mt-0" text="Home" />
            <EditButton />
          </Row>
          <DailyProfitAndBalance className="" user={user} />
        </Row>

        <SearchRow />

        {sections.map((item) => {
          const { id } = item
          if (id === 'daily-movers') {
            return <DailyMoversSection key={id} userId={user?.id} />
          }
          const sort = SORTS.find((sort) => sort.value === id)
          if (sort)
            return (
              <SearchSection
                key={id}
                label={sort.value === 'newest' ? 'New for you' : sort.label}
                sort={sort.value}
                pill={sort.value === 'newest' ? 'personal' : undefined}
                user={user}
              />
            )

          const group = groups.find((g) => g.id === id)
          if (group) return <GroupSection key={id} group={group} user={user} />

          return null
        })}
        <TrendingGroupsSection user={user} />
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

function SectionHeader(props: {
  label: string
  href: string
  children?: ReactNode
}) {
  const { label, href, children } = props

  return (
    <Row className="mb-3 items-center justify-between">
      <SiteLink className="text-xl" href={href}>
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
  user: User | null | undefined | undefined
  sort: Sort
  pill?: string
}) {
  const { label, user, sort, pill } = props

  return (
    <Col>
      <SectionHeader
        label={label}
        href={`/search?s=${sort}${pill ? `&p=${pill}` : ''}`}
      />
      <ContractSearch
        user={user}
        defaultSort={sort}
        defaultPill={pill}
        noControls
        maxResults={6}
        persistPrefix={`experimental-home-${sort}`}
      />
    </Col>
  )
}

function GroupSection(props: {
  group: Group
  user: User | null | undefined | undefined
}) {
  const { group, user } = props

  return (
    <Col>
      <SectionHeader label={group.name} href={groupPath(group.slug)}>
        <MenuButton
          buttonContent={
            <button className="text-gray-500 hover:text-gray-700">
              <DotsHorizontalIcon
                className={clsx('h-5 w-5 flex-shrink-0')}
                aria-hidden="true"
              />
            </button>
          }
          menuItems={[
            {
              name: 'Unfollow',
              onClick: () => {
                user && leaveGroup(group, user?.id)
              },
            },
          ]}
        />
      </SectionHeader>
      <ContractSearch
        user={user}
        defaultSort={'score'}
        additionalFilter={{ groupSlug: group.slug }}
        noControls
        maxResults={4}
        persistPrefix={`experimental-home-${group.slug}`}
      />
    </Col>
  )
}

function DailyMoversSection(props: { userId: string | null | undefined }) {
  const { userId } = props
  const changes = useProbChanges(userId ?? '')

  return (
    <Col className="gap-2">
      <SectionHeader label="Daily movers" href="daily-movers" />
      <ProbChangeTable changes={changes} />
    </Col>
  )
}

function EditButton(props: { className?: string }) {
  const { className } = props

  return (
    <SiteLink href="/experimental/home/edit">
      <Button size="sm" color="gray-white" className={clsx(className, 'flex')}>
        <AdjustmentsIcon className={clsx('h-[24px] w-5')} aria-hidden="true" />
      </Button>
    </SiteLink>
  )
}

function SearchRow() {
  return (
    <SiteLink href="/search" className="hover:no-underline">
      <input className="input input-bordered w-full" placeholder="Search" />
    </SiteLink>
  )
}

function DailyProfitAndBalance(props: {
  user: User | null | undefined
  className?: string
}) {
  const { user, className } = props
  const metrics = usePortfolioHistory(user?.id ?? '', 'daily') ?? []
  const [first, last] = [metrics[0], metrics[metrics.length - 1]]

  let profit = 0
  let profitPercent = 0
  if (first && last) {
    profit = calculatePortfolioProfit(last) - calculatePortfolioProfit(first)
    profitPercent = profit / first.investmentValue
  }

  return (
    <Row className={'gap-4'}>
      <Col>
        <div className="text-gray-500">Daily profit</div>
        <Row className={clsx(className, 'items-center text-lg')}>
          <span>{formatMoney(profit)}</span>{' '}
          <ProfitBadge profitPercent={profitPercent * 100} />
        </Row>
      </Col>
      <Col>
        <div className="text-gray-500">Streak</div>
        <Row className={clsx(className, 'items-center text-lg')}>
          <span>🔥 {user?.currentBettingStreak ?? 0}</span>
        </Row>
      </Col>
    </Row>
  )
}

function TrendingGroupsSection(props: { user: User | null | undefined }) {
  const { user } = props
  const memberGroupIds = useMemberGroupIds(user) || []

  const groups = useTrendingGroups().filter(
    (g) => !memberGroupIds.includes(g.id)
  )
  const chosenGroups = chooseRandomSubset(groups.slice(0, 25), 9)

  return (
    <Col>
      <SectionHeader
        label="Trending groups"
        href="/experimental/explore-groups"
      />
      <Masonry
        breakpointCols={{ default: 3, 768: 2, 480: 1 }}
        className="-ml-4 flex w-auto self-center"
        columnClassName="pl-4 bg-clip-padding"
      >
        {chosenGroups.map((g) => (
          <GroupCard
            key={g.id}
            className="mb-4 !min-w-[250px]"
            group={g}
            creator={null}
            user={user}
            isMember={memberGroupIds.includes(g.id)}
          />
        ))}
      </Masonry>
    </Col>
  )
}
