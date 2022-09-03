import React, { useState } from 'react'
import Router from 'next/router'
import { PencilIcon, PlusSmIcon } from '@heroicons/react/solid'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch, SORTS } from 'web/components/contract-search'
import { User } from 'common/user'
import { getUserAndPrivateUser, updateUser } from 'web/lib/firebase/users'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { authenticateOnServer } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { GetServerSideProps } from 'next'
import { Sort } from 'web/components/contract-search'
import { Group } from 'common/group'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { GroupLinkItem } from '../../groups'
import { SiteLink } from 'web/components/site-link'
import { useUser } from 'web/hooks/use-user'
import { useMemberGroups } from 'web/hooks/use-group'
import { DoubleCarousel } from '../../../components/double-carousel'
import clsx from 'clsx'
import { Button } from 'web/components/button'
import { ArrangeHome, getHomeItems } from '../../../components/arrange-home'
import { Title } from 'web/components/title'
import { Row } from 'web/components/layout/row'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const creds = await authenticateOnServer(ctx)
  const auth = creds ? await getUserAndPrivateUser(creds.uid) : null
  return { props: { auth } }
}

const Home = (props: { auth: { user: User } | null }) => {
  const user = useUser() ?? props.auth?.user ?? null

  useTracking('view home')

  useSaveReferral()

  const groups = useMemberGroups(user?.id) ?? []

  const [homeSections, setHomeSections] = useState(
    user?.homeSections ?? { visible: [], hidden: [] }
  )
  const { visibleItems } = getHomeItems(groups, homeSections)

  const updateHomeSections = (newHomeSections: {
    visible: string[]
    hidden: string[]
  }) => {
    if (!user) return
    updateUser(user.id, { homeSections: newHomeSections })
    setHomeSections(newHomeSections)
  }

  const [isEditing, setIsEditing] = useState(false)

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 px-4 pb-12 xl:w-[125%]">
        <Row className={'w-full items-center justify-between'}>
          <Title text={isEditing ? 'Edit your home page' : 'Home'} />

          <EditDoneButton isEditing={isEditing} setIsEditing={setIsEditing} />
        </Row>

        {isEditing ? (
          <>
            <ArrangeHome
              user={user}
              homeSections={homeSections}
              setHomeSections={updateHomeSections}
            />
          </>
        ) : (
          visibleItems.map((item) => {
            const { id } = item
            if (id === 'your-bets') {
              return (
                <SearchSection
                  key={id}
                  label={'Your bets'}
                  sort={'newest'}
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
            if (group)
              return <GroupSection key={id} group={group} user={user} />

            return null
          })
        )}
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
  user: User | null
  sort: Sort
  yourBets?: boolean
}) {
  const { label, user, sort, yourBets } = props
  const href = `/home?s=${sort}`

  return (
    <Col>
      <SiteLink className="mb-2 text-xl" href={href}>
        {label}
      </SiteLink>
      <ContractSearch
        user={user}
        defaultSort={sort}
        additionalFilter={yourBets ? { yourBets: true } : undefined}
        noControls
        // persistPrefix={`experimental-home-${sort}`}
        renderContracts={(contracts, loadMore) =>
          contracts ? (
            <DoubleCarousel
              contracts={contracts}
              seeMoreUrl={href}
              showTime={
                sort === 'close-date' || sort === 'resolve-date'
                  ? sort
                  : undefined
              }
              loadMore={loadMore}
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
    <Col>
      <GroupLinkItem className="mb-2 text-xl" group={group} />
      <ContractSearch
        user={user}
        defaultSort={'score'}
        additionalFilter={{ groupSlug: group.slug }}
        noControls
        // persistPrefix={`experimental-home-${group.slug}`}
        renderContracts={(contracts, loadMore) =>
          contracts ? (
            contracts.length == 0 ? (
              <div className="m-2 text-gray-500">No open markets</div>
            ) : (
              <DoubleCarousel
                contracts={contracts}
                seeMoreUrl={`/group/${group.slug}`}
                loadMore={loadMore}
              />
            )
          ) : (
            <LoadingIndicator />
          )
        }
      />
    </Col>
  )
}

function EditDoneButton(props: {
  isEditing: boolean
  setIsEditing: (isEditing: boolean) => void
  className?: string
}) {
  const { isEditing, setIsEditing, className } = props

  return (
    <Button
      size="lg"
      color={isEditing ? 'blue' : 'gray-white'}
      className={clsx(className, 'flex')}
      onClick={() => {
        setIsEditing(!isEditing)
      }}
    >
      {!isEditing && (
        <PencilIcon className={clsx('mr-2 h-[24px] w-5')} aria-hidden="true" />
      )}
      {isEditing ? 'Done' : 'Edit'}
    </Button>
  )
}

export default Home
