import React from 'react'
import Router from 'next/router'
import { PlusSmIcon } from '@heroicons/react/solid'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch } from 'web/components/contract-search'
import { User } from 'common/user'
import { getUserAndPrivateUser } from 'web/lib/firebase/users'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { authenticateOnServer } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { GetServerSideProps } from 'next'
import { Sort } from 'web/components/contract-search'
import { Button } from 'web/components/button'
import { Spacer } from 'web/components/layout/spacer'
import { useMemberGroups } from 'web/hooks/use-group'
import { Group } from 'common/group'
import { Carousel } from 'web/components/carousel'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { ContractCard } from 'web/components/contract/contract-card'
import { range } from 'lodash'
import { Subtitle } from 'web/components/subtitle'
import { Contract } from 'common/contract'
import { ShowTime } from 'web/components/contract/contract-details'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const creds = await authenticateOnServer(ctx)
  const auth = creds ? await getUserAndPrivateUser(creds.user.uid) : null
  return { props: { auth } }
}

const Home = (props: { auth: { user: User } | null }) => {
  const user = props.auth ? props.auth.user : null

  useTracking('view home')

  useSaveReferral()

  const memberGroups = (useMemberGroups(user?.id) ?? []).filter(
    (group) => group.contractIds.length > 0
  )

  return (
    <Page>
      <Col className="mx-4 mt-4 gap-2 sm:mx-10 xl:w-[125%]">
        <SearchSection label="Trending" sort="score" user={user} />
        <SearchSection label="Newest" sort="newest" user={user} />
        <SearchSection label="Closing soon" sort="close-date" user={user} />
        {memberGroups.map((group) => (
          <GroupSection key={group.id} group={group} user={user} />
        ))}
      </Col>
      <button
        type="button"
        className="fixed bottom-[70px] right-3 inline-flex items-center rounded-full border border-transparent bg-indigo-600 p-3 text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 lg:hidden"
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
  user: User | null
  sort: Sort
}) {
  const { label, user, sort } = props

  return (
    <Col>
      <Subtitle className="mx-2 !mt-2 !text-gray-800 sm:mx-0" text={label} />
      <ContractSearch
        user={user}
        defaultSort={sort}
        maxItems={12}
        noControls
        renderContracts={(contracts) =>
          contracts ? (
            <DoubleCarousel
              contracts={contracts}
              seeMoreUrl={`/home?s=${sort}`}
            />
          ) : (
            <LoadingIndicator />
          )
        }
      />
    </Col>
  )
}

function GroupSection(props: { group: Group; user: User | null }) {
  const { group, user } = props

  return (
    <Col className="">
      <Subtitle className="mx-2 !text-gray-800 sm:mx-0" text={group.name} />
      <Spacer h={2} />
      <ContractSearch
        user={user}
        defaultSort={'score'}
        additionalFilter={{ groupSlug: group.slug }}
        maxItems={12}
        noControls
        renderContracts={(contracts) =>
          contracts ? (
            <DoubleCarousel
              contracts={contracts}
              seeMoreUrl={`/group/${group.slug}`}
            />
          ) : (
            <LoadingIndicator />
          )
        }
      />
    </Col>
  )
}

function DoubleCarousel(props: {
  contracts: Contract[]
  seeMoreUrl?: string
  showTime?: ShowTime
}) {
  const { contracts, seeMoreUrl, showTime } = props
  return (
    <Carousel className="-mx-4 mt-2 sm:-mx-10">
      <div className="shrink-0 sm:w-6" />
      {contracts &&
        range(0, Math.floor(contracts.length / 2)).map((col) => {
          const i = col * 2
          return (
            <Col>
              <ContractCard
                key={contracts[i].id}
                contract={contracts[i]}
                className="mb-2 max-h-[200px] w-96 shrink-0"
                questionClass="line-clamp-3"
                trackingPostfix=" tournament"
                showTime={showTime}
              />
              <ContractCard
                key={contracts[i + 1].id}
                contract={contracts[i + 1]}
                className="mb-2 max-h-[200px] w-96 shrink-0"
                questionClass="line-clamp-3"
                trackingPostfix=" tournament"
                showTime={showTime}
              />
            </Col>
          )
        })}
      <Button
        className="self-center whitespace-nowrap"
        color="blue"
        size="sm"
        onClick={() => seeMoreUrl && Router.push(seeMoreUrl)}
      >
        See more
      </Button>
    </Carousel>
  )
}

export default Home
