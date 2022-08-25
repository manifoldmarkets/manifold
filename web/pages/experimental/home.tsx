import React from 'react'
import { useRouter } from 'next/router'
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
import { Sort } from 'web/hooks/use-sort-and-query-params'
import { Button } from 'web/components/button'
import { Spacer } from 'web/components/layout/spacer'
import { useMemberGroups } from 'web/hooks/use-group'
import { Group } from 'common/group'
import { Title } from 'web/components/title'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const creds = await authenticateOnServer(ctx)
  const auth = creds ? await getUserAndPrivateUser(creds.user.uid) : null
  return { props: { auth } }
}

const Home = (props: { auth: { user: User } | null }) => {
  const user = props.auth ? props.auth.user : null

  const router = useRouter()
  useTracking('view home')

  useSaveReferral()

  const memberGroups = (useMemberGroups(user?.id) ?? []).filter(
    (group) => group.contractIds.length > 0
  )

  return (
    <Page>
      <Col className="mx-auto mb-8 w-full">
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
          router.push('/create')
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

  const router = useRouter()

  return (
    <Col>
      <Title className="mx-2 !text-gray-800 sm:mx-0" text={label} />
      <Spacer h={2} />
      <ContractSearch user={user} defaultSort={sort} maxItems={4} noControls />
      <Button
        className="self-end"
        color="blue"
        size="sm"
        onClick={() => router.push(`/home?s=${sort}`)}
      >
        See more
      </Button>
    </Col>
  )
}

function GroupSection(props: { group: Group; user: User | null }) {
  const { group, user } = props

  const router = useRouter()

  return (
    <Col className="">
      <Title className="mx-2 !text-gray-800 sm:mx-0" text={group.name} />
      <Spacer h={2} />
      <ContractSearch
        user={user}
        defaultSort={'score'}
        additionalFilter={{ groupSlug: group.slug }}
        maxItems={4}
        noControls
      />
      <Button
        className="mr-2 self-end"
        color="blue"
        size="sm"
        onClick={() => router.push(`/group/${group.slug}`)}
      >
        See more
      </Button>
    </Col>
  )
}

export default Home
