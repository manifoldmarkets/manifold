import { UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group, groupPath } from 'common/group'
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { useMutation } from 'react-query'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import DiscoverGroups from 'web/components/groups/discover-groups'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import YourGroups from 'web/components/groups/your-groups'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { SEO } from 'web/components/SEO'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'
import { useMemberGroupIds } from 'web/hooks/use-group'
import { useUser } from 'web/hooks/use-user'
import { User } from 'web/lib/firebase/users'
import { searchContract } from 'web/lib/supabase/contracts'
import { SearchGroupInfo } from 'web/lib/supabase/groups'

export default function Groups(props: { groups: SearchGroupInfo[] }) {
  const user = useUser()
  const yourGroupIds = useMemberGroupIds(user)
  return (
    <Page>
      <SEO
        title="Groups"
        description="Topics and communities centered prediction markets."
        url="/groups"
      />
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-4 sm:px-2">
          <Row className="items-start justify-between">
            <Title>Groups</Title>
            {user && (
              <CreateGroupButton
                user={user}
                goToGroupOnSubmit={true}
                className={'w-32 whitespace-nowrap'}
              />
            )}
          </Row>
          {user && yourGroupIds && yourGroupIds.length > 0 && (
            <UncontrolledTabs
              className={'mb-4'}
              tabs={[
                {
                  title: 'Your Groups',
                  content: <YourGroups yourGroupIds={yourGroupIds} />,
                },
                {
                  title: 'Discover',
                  content: <DiscoverGroups yourGroupIds={yourGroupIds} />,
                },
              ]}
            />
          )}{' '}
          {!user ||
            !yourGroupIds ||
            (yourGroupIds.length < 1 && (
              <DiscoverGroups yourGroupIds={yourGroupIds} />
            ))}
        </Col>
      </Col>
    </Page>
  )
}

function Community(props: {
  name: string
  description: string
  selected: boolean
  onClick: () => void
  groups: SearchGroupInfo[]
  className?: string
}) {
  const { name, description, selected, onClick, groups, className } = props

  return (
    <div
      className={clsx(
        'bg-canvas-0 cursor hover:bg-canvas-100 mb-2 rounded-lg p-4',
        selected ? 'border-primary-200' : 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className="flex flex-wrap items-baseline justify-between">
        <div className="mr-4 min-w-[120px] text-xl">{name}</div>
        <div className="text-ink-700">{description}</div>
      </div>
      {selected && <GroupPills groups={groups} autoselect />}
    </div>
  )
}

function GroupSearchResult(props: { groups: SearchGroupInfo[] }) {
  const user = useUser()
  const myGroupsIds = useMemberGroupIds(user)
  return (
    <>
      {props.groups.map((group) => (
        <GroupLine
          key={group.id}
          group={group as Group}
          user={user}
          isMember={!!myGroupsIds?.includes(group.id)}
        />
      ))}
    </>
  )
}

function GroupLine(props: {
  group: Group
  isMember: boolean
  user: User | undefined | null
}) {
  const { group, isMember, user } = props

  const [show, setShow] = useState(false)

  return (
    <div
      className={clsx(show ? 'bg-canvas-0' : 'hover:bg-canvas-0', 'rounded-md')}
    >
      <div
        className="flex cursor-pointer items-center justify-between p-2"
        onClick={() => setShow((shown: boolean) => !shown)}
      >
        {group.name}
        <div className="flex gap-4">
          <span className="flex items-center">
            <UsersIcon className="mr-1 h-4 w-4" />
            {group.totalMembers}
          </span>
          <JoinOrLeaveGroupButton
            group={group}
            user={user}
            isMember={isMember}
            className="w-[80px] !px-0 !py-1"
          />
        </div>
      </div>
      {show && <SingleGroupInfo group={group} />}
    </div>
  )
}

function GroupPills(props: {
  groups: SearchGroupInfo[]
  autoselect?: boolean
}) {
  const { groups, autoselect } = props
  const user = useUser()
  const myGroupsIds = useMemberGroupIds(user)
  const [selected, setSelected] = useState<SearchGroupInfo | null>(
    autoselect ? groups[0] : null
  )

  return (
    <>
      {groups.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-1">
          {groups.map((group) => (
            <div
              key={group.id}
              className={clsx(
                selected?.id === group.id
                  ? 'bg-primary-200'
                  : 'bg-ink-200 hover:bg-ink-300',
                'cursor-pointer rounded-full px-3 py-1'
              )}
              onClick={() => setSelected(group)}
            >
              {group.name}
            </div>
          ))}
        </div>
      )}
      {selected && (
        <SingleGroupInfo key={selected.id} group={selected}>
          <span className="text-ink-700 flex items-center">
            <UsersIcon className="mr-1 h-4 w-4" />
            {selected.totalMembers}
          </span>
          <JoinOrLeaveGroupButton
            group={selected}
            user={user}
            isMember={myGroupsIds?.includes(selected.id)}
            className="w-[80px] !px-0 !py-1"
          />
        </SingleGroupInfo>
      )}
    </>
  )
}

function SingleGroupInfo(props: {
  group: SearchGroupInfo
  children?: ReactNode
}) {
  const { group, children } = props

  const trendingMutate = useMutation(() =>
    searchContract({
      query: '',
      filter: 'open',
      sort: 'score',
      group_id: group.id,
      limit: 5,
    })
  )
  useEffect(trendingMutate.mutate, [])

  return (
    <div className="bg-canvas-0 border-ink-300 mt-1 flex flex-col rounded">
      {trendingMutate.isLoading && (
        <div className="flex h-[200px] items-center justify-center">
          <LoadingIndicator />
        </div>
      )}
      {trendingMutate.data && (
        <ContractsTable
          contracts={trendingMutate.data.data as Contract[]}
          isMobile={true}
        />
      )}

      <div className={clsx('flex items-center justify-between gap-4 p-2')}>
        <Link
          href={groupPath(group.slug)}
          className="text-primary-700 hover:underline"
        >
          All {group.totalContracts} markets
        </Link>
        <div className="flex gap-4">{children}</div>
      </div>
    </div>
  )
}
export function GroupLinkItem(props: {
  group: { slug: string; name: string }
  className?: string
}) {
  const { group, className } = props

  return (
    <SiteLink
      href={groupPath(group.slug)}
      className={clsx('z-10 truncate', className)}
    >
      {group.name}
    </SiteLink>
  )
}
