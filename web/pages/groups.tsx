import { debounce, sortBy } from 'lodash'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Group, groupPath } from 'common/group'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useGroups, useMemberGroupIds } from 'web/hooks/use-group'
import { listAllGroups } from 'web/lib/firebase/groups'
import { getUser, getUserAndPrivateUser, User } from 'web/lib/firebase/users'
import { Tabs } from 'web/components/layout/tabs'
import { SiteLink } from 'web/components/widgets/site-link'
import clsx from 'clsx'
import { Avatar } from 'web/components/widgets/avatar'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { searchInAny } from 'common/util/parse'
import { SEO } from 'web/components/SEO'
import { GetServerSideProps } from 'next'
import { authenticateOnServer } from 'web/lib/firebase/server-auth'
import { useUser } from 'web/hooks/use-user'
import { Input } from 'web/components/widgets/input'
import { track } from 'web/lib/service/analytics'
import { CardHighlightOptions } from 'web/components/contract/contracts-grid'
import { Card } from 'web/components/widgets/card'
import { FeaturedPill } from 'web/components/contract/contract-card'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const creds = await authenticateOnServer(ctx)
  const auth = creds ? await getUserAndPrivateUser(creds.uid) : null
  const groups = await listAllGroups().catch((_) => [])

  const creators = await Promise.all(
    groups.map((group) => getUser(group.creatorId))
  )
  const creatorsDict = Object.fromEntries(
    creators.map((creator) => [creator.id, creator])
  )

  return { props: { auth, groups, creatorsDict } }
}

export default function Groups(props: {
  auth: { user: User } | null
  groups: Group[]
  creatorsDict: { [k: string]: User }
}) {
  //TODO: do we really need the creatorsDict?
  const [creatorsDict, setCreatorsDict] = useState(props.creatorsDict)
  const serverUser = props.auth?.user
  const groups = useGroups() ?? props.groups
  const user = useUser() ?? serverUser
  const memberGroupIds = useMemberGroupIds(user) || []

  useEffect(() => {
    // Load User object for creator of new Groups.
    const newGroups = groups.filter(({ creatorId }) => !creatorsDict[creatorId])
    if (newGroups.length > 0) {
      Promise.all(newGroups.map(({ creatorId }) => getUser(creatorId))).then(
        (newUsers) => {
          const newUsersDict = Object.fromEntries(
            newUsers.map((user) => [user.id, user])
          )
          setCreatorsDict({ ...creatorsDict, ...newUsersDict })
        }
      )
    }
  }, [creatorsDict, groups])

  const [query, setQuery] = useState('')

  const matchesOrderedByMostContractAndMembers = sortBy(groups, [
    (group) => -1 * group.totalContracts,
    (group) => -1 * group.totalMembers,
  ]).filter((g) =>
    searchInAny(
      query,
      g.name,
      g.about || '',
      creatorsDict[g.creatorId].username
    )
  )

  // Not strictly necessary, but makes the "hold delete" experience less laggy
  const debouncedQuery = debounce(setQuery, 50)

  return (
    <Page>
      <SEO
        title="Groups"
        description="Manifold Groups are communities centered around a collection of prediction markets. Discuss and compete on questions with your friends."
        url="/groups"
      />
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-4 sm:px-2">
          <Row className="items-center justify-between">
            <Title text="Explore groups" />
            {user && <CreateGroupButton user={user} goToGroupOnSubmit={true} />}
          </Row>

          <div className="mb-6 text-gray-500">
            Discuss and compete on questions with a group of friends.
          </div>

          <Tabs
            className="mb-4"
            currentPageForAnalytics={'groups'}
            tabs={[
              {
                title: 'All',
                content: (
                  <Col>
                    <Input
                      type="text"
                      onChange={(e) => debouncedQuery(e.target.value)}
                      placeholder="Search groups"
                      value={query}
                      className="mb-4 w-full"
                    />

                    <div className="grid grid-cols-1 flex-wrap justify-center gap-4 sm:grid-cols-2">
                      {matchesOrderedByMostContractAndMembers.map((group) => (
                        <GroupCard
                          key={group.id}
                          group={group}
                          creator={creatorsDict[group.creatorId]}
                          user={user}
                          isMember={memberGroupIds.includes(group.id)}
                        />
                      ))}
                    </div>
                  </Col>
                ),
              },
              ...(user
                ? [
                    {
                      title: 'My Groups',
                      content: (
                        <Col>
                          <Input
                            type="text"
                            value={query}
                            onChange={(e) => debouncedQuery(e.target.value)}
                            placeholder="Search your groups"
                            className="mb-4 w-full"
                          />

                          <div className="grid grid-cols-1 flex-wrap justify-center gap-4 sm:grid-cols-2">
                            {matchesOrderedByMostContractAndMembers
                              .filter((match) =>
                                memberGroupIds.includes(match.id)
                              )
                              .map((group) => (
                                <GroupCard
                                  key={group.id}
                                  group={group}
                                  creator={creatorsDict[group.creatorId]}
                                  user={user}
                                  isMember={memberGroupIds.includes(group.id)}
                                />
                              ))}
                          </div>
                        </Col>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Col>
      </Col>
    </Page>
  )
}

export function GroupCard(props: {
  group: Group
  creator?: User | null | undefined
  user?: User | undefined | null
  isMember?: boolean
  className?: string
  onGroupClick?: (group: Group) => void
  highlightOptions?: CardHighlightOptions
  pinned?: boolean
}) {
  const {
    group,
    creator,
    user,
    isMember,
    className,
    onGroupClick,
    highlightOptions,
    pinned,
  } = props
  const { totalContracts } = group
  const { itemIds: itemIds, highlightClassName } = highlightOptions || {}
  return (
    <Card
      className={clsx(
        'relative min-w-[20rem]  gap-1 rounded-xl bg-white p-6  hover:bg-gray-100',
        className,
        itemIds?.includes(group.id) && highlightClassName
      )}
      onClick={(e) => {
        if (!onGroupClick) return
        // Let the browser handle the link click (opens in new tab).
        if (e.ctrlKey || e.metaKey) return

        e.preventDefault()
        track('select group card'),
          {
            slug: group.slug,
            postId: group.id,
          }
        onGroupClick(group)
      }}
    >
      <Link
        className={onGroupClick ? 'pointer-events-none' : ''}
        href={groupPath(group.slug)}
      >
        <div>
          {creator != null && (
            <Avatar
              className={'absolute top-2 right-2 z-10'}
              username={creator?.username}
              avatarUrl={creator?.avatarUrl}
              noLink={false}
              size={12}
            />
          )}
        </div>

        <Row className="items-center justify-between gap-2">
          <span className="text-xl">{group.name}</span>
          {pinned && (
            <Row>
              <FeaturedPill />
            </Row>
          )}
        </Row>
        <Row>{totalContracts} questions</Row>
        <Row className="text-sm text-gray-500">
          <GroupMembersList group={group} />
        </Row>
        <Row>
          <div className="text-sm text-gray-500">{group.about}</div>
        </Row>
        {isMember != null && user != null && (
          <div className={'z-10 mt-2 h-full items-start justify-end'}>
            <JoinOrLeaveGroupButton
              group={group}
              className={'z-10 w-24'}
              user={user}
              isMember={isMember}
            />
          </div>
        )}
      </Link>
    </Card>
  )
}

function GroupMembersList(props: { group: Group }) {
  const { group } = props
  const { totalMembers } = group
  if (totalMembers === 1) return <div />
  return (
    <div className="flex flex-wrap gap-1 text-gray-700">
      <span>{totalMembers} members</span>
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
