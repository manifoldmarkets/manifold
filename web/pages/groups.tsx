import { sortBy, debounce } from 'lodash'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { useGroups, useMemberGroupIds, useMembers } from 'web/hooks/use-group'
import { useUser } from 'web/hooks/use-user'
import { groupPath, listAllGroups } from 'web/lib/firebase/groups'
import { getUser, User } from 'web/lib/firebase/users'
import { Tabs } from 'web/components/layout/tabs'
import { checkAgainstQuery } from 'web/hooks/use-sort-and-query-params'
import { SiteLink } from 'web/components/site-link'
import clsx from 'clsx'
import { Avatar } from 'web/components/avatar'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { UserLink } from 'web/components/user-page'

export async function getStaticProps() {
  const groups = await listAllGroups().catch((_) => [])

  const creators = await Promise.all(
    groups.map((group) => getUser(group.creatorId))
  )
  const creatorsDict = Object.fromEntries(
    creators.map((creator) => [creator.id, creator])
  )

  return {
    props: {
      groups: groups,
      creatorsDict,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function Groups(props: {
  groups: Group[]
  creatorsDict: { [k: string]: User }
}) {
  const [creatorsDict, setCreatorsDict] = useState(props.creatorsDict)

  const groups = useGroups() ?? props.groups
  const user = useUser()
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

  // List groups with the highest question count, then highest member count
  // TODO use find-active-contracts to sort by?
  const matches = sortBy(groups, [
    (group) => -1 * group.contractIds.length,
    (group) => -1 * group.memberIds.length,
  ]).filter(
    (g) =>
      checkAgainstQuery(query, g.name) ||
      checkAgainstQuery(query, g.about || '') ||
      checkAgainstQuery(query, creatorsDict[g.creatorId].username)
  )

  const matchesOrderedByRecentActivity = sortBy(groups, [
    (group) =>
      -1 *
      (group.mostRecentChatActivityTime ??
        group.mostRecentContractAddedTime ??
        group.mostRecentActivityTime),
  ]).filter(
    (g) =>
      checkAgainstQuery(query, g.name) ||
      checkAgainstQuery(query, g.about || '') ||
      checkAgainstQuery(query, creatorsDict[g.creatorId].username)
  )

  // Not strictly necessary, but makes the "hold delete" experience less laggy
  const debouncedQuery = debounce(setQuery, 50)

  return (
    <Page>
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
              ...(user && memberGroupIds.length > 0
                ? [
                    {
                      title: 'My Groups',
                      content: (
                        <Col>
                          <input
                            type="text"
                            onChange={(e) => debouncedQuery(e.target.value)}
                            placeholder="Search your groups"
                            className="input input-bordered mb-4 w-full"
                          />

                          <div className="flex flex-wrap justify-center gap-4">
                            {matchesOrderedByRecentActivity
                              .filter((match) =>
                                memberGroupIds.includes(match.id)
                              )
                              .map((group) => (
                                <GroupCard
                                  key={group.id}
                                  group={group}
                                  creator={creatorsDict[group.creatorId]}
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
                      className="input input-bordered mb-4 w-full"
                    />

                    <div className="flex flex-wrap justify-center gap-4">
                      {matches.map((group) => (
                        <GroupCard
                          key={group.id}
                          group={group}
                          creator={creatorsDict[group.creatorId]}
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

export function GroupCard(props: { group: Group; creator: User | undefined }) {
  const { group, creator } = props
  return (
    <Col className="relative min-w-[20rem]  max-w-xs gap-1 rounded-xl bg-white p-8 shadow-md hover:bg-gray-100">
      <Link href={groupPath(group.slug)}>
        <a className="absolute left-0 right-0 top-0 bottom-0 z-0" />
      </Link>
      <div>
        <Avatar
          className={'absolute top-2 right-2'}
          username={creator?.username}
          avatarUrl={creator?.avatarUrl}
          noLink={false}
          size={12}
        />
      </div>
      <Row className="items-center justify-between gap-2">
        <span className="text-xl">{group.name}</span>
      </Row>
      <Row>{group.contractIds.length} questions</Row>
      <Row className="text-sm text-gray-500">
        <GroupMembersList group={group} />
      </Row>
      <Row>
        <div className="text-sm text-gray-500">{group.about}</div>
      </Row>
      <Col className={'mt-2 h-full items-start justify-end'}>
        <JoinOrLeaveGroupButton group={group} className={'z-10 w-24'} />
      </Col>
    </Col>
  )
}

function GroupMembersList(props: { group: Group }) {
  const { group } = props
  const maxMembersToShow = 3
  const members = useMembers(group, maxMembersToShow).filter(
    (m) => m.id !== group.creatorId
  )
  if (group.memberIds.length === 1) return <div />
  return (
    <div className="text-neutral flex flex-wrap gap-1">
      <span className={'text-gray-500'}>Other members</span>
      {members.slice(0, maxMembersToShow).map((member, i) => (
        <div key={member.id} className={'flex-shrink'}>
          <UserLink name={member.name} username={member.username} />
          {members.length > 1 && i !== members.length - 1 && <span>,</span>}
        </div>
      ))}
      {group.memberIds.length > maxMembersToShow && (
        <span> & {group.memberIds.length - maxMembersToShow} more</span>
      )}
    </div>
  )
}

export function GroupLink(props: { group: Group; className?: string }) {
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
