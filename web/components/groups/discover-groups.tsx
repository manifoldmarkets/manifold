import { UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group, GroupsByTopic, groupPath } from 'common/group'
import { User } from 'common/user'
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { useMutation } from 'react-query'
import { useListGroupsBySlug } from 'web/hooks/use-group-supabase'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { searchContract } from 'web/lib/supabase/contracts'
import { GroupAndRoleType, SearchGroupInfo } from 'web/lib/supabase/groups'
import { shortenNumber } from 'web/lib/util/shortenNumber'
import { ContractsTable } from '../contract/contracts-table'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { SiteLink } from '../widgets/site-link'
import { Subtitle } from '../widgets/subtitle'
import { MemberRoleTag } from './group-member-modal'
import { PRIVACY_STATUS_ITEMS } from './group-privacy-modal'
import GroupSearch from './group-search'
import { JoinOrLeaveGroupButton } from './groups-button'

export default function DiscoverGroups(props: { yourGroupIds: string[] }) {
  const { yourGroupIds } = props
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

  const allSpecialGroupSlugs = Object.values(GroupsByTopic).flat()
  const allSpecialGroups = useListGroupsBySlug(allSpecialGroupSlugs)

  const [selectedCommunity, setSelected] = useState<number>()

  return (
    <>
      <Subtitle>Top Communities</Subtitle>
      {communities.map((c, i) => (
        <Community
          name={c.name}
          description={c.description}
          selected={i === selectedCommunity}
          onClick={() => setSelected(i)}
          groups={
            allSpecialGroups
              ? allSpecialGroups.filter((g) => c.slugs?.includes(g.slug))
              : []
          }
          yourGroupIds={yourGroupIds}
        />
      ))}
      <Subtitle>Search Groups</Subtitle>

      <GroupSearch
        persistPrefix={'discover-groups'}
        yourGroupIds={yourGroupIds}
      />
    </>
  )
}

function Community(props: {
  name: string
  description: string
  selected: boolean
  onClick: () => void
  groups: SearchGroupInfo[]
  yourGroupIds: string[]
  className?: string
}) {
  const {
    name,
    description,
    selected,
    onClick,
    groups,
    yourGroupIds,
    className,
  } = props

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
      {selected && (
        <GroupPills groups={groups} yourGroupIds={yourGroupIds} autoselect />
      )}
    </div>
  )
}

export function GroupSummary(props: { group: Group }) {
  const { group } = props
  const { icon, status } = PRIVACY_STATUS_ITEMS[group.privacyStatus]
  return (
    <Row className={clsx('text-ink-500 gap- gap-2 text-sm')}>
      <span className="flex items-center">
        <UsersIcon className="mr-0.5 h-4 w-4" />
        {shortenNumber(group.totalMembers)}
      </span>
      <Row
        className={clsx(
          'items-center gap-0.5',
          group.privacyStatus == 'private' ? 'text-primary-500' : ''
        )}
      >
        {icon}
        {status}
      </Row>
    </Row>
  )
}

export function GroupLine(props: {
  group: Group
  isMember: boolean
  user: User | undefined | null
  yourGroupRoles?: GroupAndRoleType[] | null
}) {
  const { group, isMember, user, yourGroupRoles } = props
  const role = yourGroupRoles?.find((r) => r.group.id == group.id)?.role
  const isCreator = user?.id == group.creatorId
  const isMobile = useIsMobile()
  const isPrivate = group.privacyStatus == 'private'

  return (
    <Link
      href={groupPath(group.slug)}
      className={clsx('hover:bg-canvas-0', 'rounded-md p-2')}
    >
      <div className={clsx('flex cursor-pointer items-center justify-between')}>
        {group.name}
        <Row className="gap-4">
          {(role || isCreator) && (
            <MemberRoleTag
              role={role}
              isCreator={!!isCreator}
              className="ml-1 w-min opacity-60"
            />
          )}
          {!isPrivate && !isCreator && (
            <JoinOrLeaveGroupButton
              group={group}
              user={user}
              disabled={isCreator}
              isMember={isMember}
              className={clsx(
                isMobile ? 'rounded p-1' : '',
                isMobile
                  ? isMember
                    ? 'dark:bg-ink-400 hover:bg-ink-700 bg-gray-500'
                    : 'bg-primary-500 hover:bg-primary-600'
                  : 'w-[80px] !px-0 !py-1'
              )}
              isMobile={isMobile}
            />
          )}
        </Row>
      </div>
      <GroupSummary group={group} />
    </Link>
  )
}

function GroupPills(props: {
  groups: SearchGroupInfo[]
  yourGroupIds: string[]
  autoselect?: boolean
}) {
  const { groups, yourGroupIds, autoselect } = props
  const user = useUser()
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
            isMember={yourGroupIds?.includes(selected.id)}
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
          className="text-primary-700 w-full text-right hover:underline"
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
