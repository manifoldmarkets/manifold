import { UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group, groupPath, GroupsByTopic } from 'common/group'
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { useMutation } from 'react-query'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { useGroupSearchResults } from 'web/components/search/query-groups'
import { SEO } from 'web/components/SEO'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { useMemberGroupIds } from 'web/hooks/use-group'
import { useUser } from 'web/hooks/use-user'
import { User } from 'web/lib/firebase/users'
import { searchContract } from 'web/lib/supabase/contracts'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'

// TODO use trending groups

export const getStaticProps = async () => {
  const groups = await searchGroups('', 200).catch((_) => [])

  return { props: { groups }, revalidate: 60 }
}

export default function Groups(props: { groups: SearchGroupInfo[] }) {
  const user = useUser()

  const [query, setQuery] = useState('')

  const communities = [
    {
      name: '🎮 Destiny.gg',
      description: 'gamers betting on "stocks" for streamers',
      slugs: GroupsByTopic.destiny,
    },
    {
      name: '💡 EA & Rationality',
      description: 'nerds with a math-based life philosophy',
      slugs: GroupsByTopic.rat,
    },
    {
      name: '🤓 CGP Grey',
      description: 'youtuber for econ, gov, history...',
      slugs: GroupsByTopic.grey,
    },
    {
      name: '🤖 AI',
      description: 'robots taking over, soon-ish',
      slugs: GroupsByTopic.ai,
    },
    {
      name: '🎲 Fun',
      description: 'degens gambling on manifold',
      slugs: GroupsByTopic.ponzi,
    },
  ]

  const allSpecialGroups = Object.values(GroupsByTopic).flat()
  const otherGroups = props.groups.filter(
    (g) => !allSpecialGroups.includes(g.slug)
  )

  const searchedGroups = useGroupSearchResults(query, 50)
  const groups = query !== '' ? searchedGroups : otherGroups

  const [selectedCommunity, setSelected] = useState<number>()

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
          <Subtitle>Top Communities</Subtitle>
          {communities.map((c, i) => (
            <Community
              name={c.name}
              description={c.description}
              selected={i === selectedCommunity}
              onClick={() => setSelected(i)}
              groups={props.groups.filter((g) => c.slugs?.includes(g.slug))}
            />
          ))}
          <Subtitle>Discover Groups</Subtitle>

          <Input
            type="text"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups"
            value={query}
            className="mb-4 w-full"
          />

          <div className="grid grid-cols-1">
            <GroupSearchResult groups={groups} />
          </div>
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
      state: {
        contracts: undefined,
        fuzzyContractOffset: 0,
        shouldLoadMore: false,
        showTime: null,
      },
      query: '',
      filter: 'open',
      sort: 'score',
      group_id: group.id,
      offset: 0,
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
