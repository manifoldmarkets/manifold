import React, { useState } from 'react'
import Router from 'next/router'
import {
  PencilIcon,
  PlusSmIcon,
  ArrowSmRightIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'

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
import { useMemberGroups } from 'web/hooks/use-group'
import { Button } from 'web/components/button'
import { getHomeItems } from '../../../components/arrange-home'
import { Title } from 'web/components/title'
import { Row } from 'web/components/layout/row'
import { ProbChangeTable } from 'web/components/contract/prob-change-table'
import { groupPath } from 'web/lib/firebase/groups'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { calculatePortfolioProfit } from 'common/calculate-metrics'
import { formatMoney } from 'common/util/format'

const Home = () => {
  const user = useUser()

  useTracking('view home')

  useSaveReferral()

  const groups = useMemberGroups(user?.id) ?? []

  const [homeSections] = useState(
    user?.homeSections ?? { visible: [], hidden: [] }
  )
  const { visibleItems } = getHomeItems(groups, homeSections)

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 px-4 pb-12">
        <Row className={'w-full items-center justify-between'}>
          <Title className="!mb-0" text="Home" />

          <EditButton />
        </Row>

        <DailyProfitAndBalance userId={user?.id} />

        <div className="text-xl text-gray-800">Daily movers</div>
        <ProbChangeTable userId={user?.id} />

        {visibleItems.map((item) => {
          const { id } = item
          if (id === 'your-bets') {
            return (
              <SearchSection
                key={id}
                label={'Your trades'}
                sort={'prob-change-day'}
                user={user}
                yourBets
              />
            )
          }
          const sort = SORTS.find((sort) => sort.value === id)
          if (sort)
            return (
              <SearchSection
                key={id}
                label={sort.label}
                sort={sort.value}
                user={user}
              />
            )

          const group = groups.find((g) => g.id === id)
          if (group) return <GroupSection key={id} group={group} user={user} />

          return null
        })}
      </Col>
      <button
        type="button"
        className="fixed bottom-[70px] right-3 z-20 inline-flex items-center rounded-full border border-transparent bg-indigo-600 p-3 text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 lg:hidden"
        onClick={() => {
          Router.push('/create')
          track('mobile create button')
        }}
      >
        <PlusSmIcon className="h-8 w-8" aria-hidden="true" />
      </button>
    </Page>
  )
}

function SearchSection(props: {
  label: string
  user: User | null | undefined
  sort: Sort
  yourBets?: boolean
}) {
  const { label, user, sort, yourBets } = props
  const href = `/home?s=${sort}`

  return (
    <Col>
      <SiteLink className="mb-2 text-xl" href={href}>
        {label}{' '}
        <ArrowSmRightIcon
          className="mb-0.5 inline h-6 w-6 text-gray-500"
          aria-hidden="true"
        />
      </SiteLink>
      <ContractSearch
        user={user}
        defaultSort={sort}
        additionalFilter={yourBets ? { yourBets: true } : undefined}
        noControls
        maxResults={6}
        persistPrefix={`experimental-home-${sort}`}
      />
    </Col>
  )
}

function GroupSection(props: { group: Group; user: User | null | undefined }) {
  const { group, user } = props

  return (
    <Col>
      <SiteLink className="mb-2 text-xl" href={groupPath(group.slug)}>
        {group.name}{' '}
        <ArrowSmRightIcon
          className="mb-0.5 inline h-6 w-6 text-gray-500"
          aria-hidden="true"
        />
      </SiteLink>
      <ContractSearch
        user={user}
        defaultSort={'score'}
        additionalFilter={{ groupSlug: group.slug }}
        noControls
        maxResults={6}
        persistPrefix={`experimental-home-${group.slug}`}
      />
    </Col>
  )
}

function EditButton(props: { className?: string }) {
  const { className } = props

  return (
    <SiteLink href="/experimental/home/edit">
      <Button size="lg" color="gray-white" className={clsx(className, 'flex')}>
        <PencilIcon className={clsx('mr-2 h-[24px] w-5')} aria-hidden="true" />{' '}
        Edit
      </Button>
    </SiteLink>
  )
}

function DailyProfitAndBalance(props: {
  userId: string | null | undefined
  className?: string
}) {
  const { userId, className } = props
  const metrics = usePortfolioHistory(userId ?? '', 'daily') ?? []
  const [first, last] = [metrics[0], metrics[metrics.length - 1]]

  if (first === undefined || last === undefined) return null

  const profit =
    calculatePortfolioProfit(last) - calculatePortfolioProfit(first)

  const balanceChange = last.balance - first.balance

  return (
    <div className={clsx(className, 'text-lg')}>
      <span className={clsx(profit >= 0 ? 'text-green-500' : 'text-red-500')}>
        {profit >= 0 ? '+' : '-'}
        {formatMoney(profit)}
      </span>{' '}
      profit and{' '}
      <span
        className={clsx(balanceChange >= 0 ? 'text-green-500' : 'text-red-500')}
      >
        {balanceChange >= 0 ? '+' : '-'}
        {formatMoney(balanceChange)}
      </span>{' '}
      balance today
    </div>
  )
}

export default Home
