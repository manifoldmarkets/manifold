import { debounce, sortBy } from 'lodash'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { useGroups, useMemberGroupIds } from 'web/hooks/use-group'
import { groupPath, listAllGroups } from 'web/lib/firebase/groups'
import { getUser, getUserAndPrivateUser, User } from 'web/lib/firebase/users'
import { Tabs } from 'web/components/layout/tabs'
import { SiteLink } from 'web/components/site-link'
import clsx from 'clsx'
import { Avatar } from 'web/components/avatar'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { searchInAny } from 'common/util/parse'
import { SEO } from 'web/components/SEO'
import { GetServerSideProps } from 'next'
import { authenticateOnServer } from 'web/lib/firebase/server-auth'
import { useUser } from 'web/hooks/use-user'

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
            currentPageForAnalytics={'groups'}
            tabs={[
              ...(user
                ? [
                    {
                      title: 'My Groups',
                      content: (
                        <Col>
                          <input
                            type="text"
                            value={query}
                            onChange={(e) => debouncedQuery(e.target.value)}
                            placeholder="Search your groups"
                            className="input input-bordered mb-4 w-full"
                          />

                          <div className="flex flex-wrap justify-center gap-4">
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
              {
                title: 'All',
                content: (
                  <Col>
                    <input
                      type="text"
                      onChange={(e) => debouncedQuery(e.target.value)}
                      placeholder="Search groups"
                      value={query}
                      className="input input-bordered mb-4 w-full"
                    />

                    <div className="flex flex-wrap justify-center gap-4">
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
            ]}
          />
        </Col>
      </Col>
    </Page>
  )
}

export function GroupCard(props: {
  group: Group
  creator: User | undefined
  user: User | undefined | null
  isMember: boolean
}) {
  const { group, creator, user, isMember } = props
  const { totalContracts } = group
  return (
    <Col className="relative min-w-[20rem]  max-w-xs gap-1 rounded-xl bg-white p-8 shadow-md hover:bg-gray-100">
      <Link href={groupPath(group.slug)}>
        <a className="absolute left-0 right-0 top-0 bottom-0 z-0" />
      </Link>
      <div>
        <Avatar
          className={'absolute top-2 right-2 z-10'}
          username={creator?.username}
          avatarUrl={creator?.avatarUrl}
          noLink={false}
          size={12}
        />
      </div>
      <Row className="items-center justify-between gap-2">
        <span className="text-xl">{group.name}</span>
      </Row>
      <Row>{totalContracts} questions</Row>
      <Row className="text-sm text-gray-500">
        <GroupMembersList group={group} />
      </Row>
      <Row>
        <div className="text-sm text-gray-500">{group.about}</div>
      </Row>
      <Col className={'mt-2 h-full items-start justify-end'}>
        <JoinOrLeaveGroupButton
          group={group}
          className={'z-10 w-24'}
          user={user}
          isMember={isMember}
        />
      </Col>
    </Col>
  )
}

function GroupMembersList(props: { group: Group }) {
  const { group } = props
  const { totalMembers } = group
  if (totalMembers === 1) return <div />
  return (
    <div className="text-neutral flex flex-wrap gap-1">
      <span>{totalMembers} members</span>
    </div>
  )
}

export function GroupLinkItem(props: { group: Group; className?: string }) {
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
