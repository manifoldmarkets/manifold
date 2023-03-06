import clsx from 'clsx'
import { Group, groupPath } from 'common/group'
import Link from 'next/link'
import { useState } from 'react'
import { FeaturedPill } from 'web/components/contract/contract-card'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Tabs } from 'web/components/layout/tabs'
import { useGroupSearchResults } from 'web/components/search/query-groups'
import { SEO } from 'web/components/SEO'
import { Avatar } from 'web/components/widgets/avatar'
import { Card } from 'web/components/widgets/card'
import { Input } from 'web/components/widgets/input'
import { SiteLink } from 'web/components/widgets/site-link'
import { useMemberGroupIds } from 'web/hooks/use-group'
import { useUser } from 'web/hooks/use-user'
import { User } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'

export const getStaticProps = async () => {
  const groups = await searchGroups('', 100).catch((_) => [])

  return { props: { groups }, revalidate: 60 }
}

export default function Groups(props: { groups: SearchGroupInfo[] }) {
  const user = useUser()
  const memberGroupIds = useMemberGroupIds(user) || []

  const [query, setQuery] = useState('')
  const searchedGroups = useGroupSearchResults(query, 50)

  const groups = query !== '' ? searchedGroups : props.groups

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
            <div className="mt-3 sm:mt-0">
              Discover groups of markets and follow them to customize your
              recommendations.
            </div>
            {user && (
              <CreateGroupButton
                user={user}
                goToGroupOnSubmit={true}
                className={'w-32 whitespace-nowrap'}
              />
            )}
          </Row>

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
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search groups"
                      value={query}
                      className="mb-4 w-full"
                    />

                    <div className="grid grid-cols-1 flex-wrap justify-center gap-4 sm:grid-cols-2">
                      {groups.map((group) => (
                        <GroupCard
                          key={group.id}
                          group={group as Group}
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
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search your groups"
                            className="mb-4 w-full"
                          />

                          <div className="grid grid-cols-1 flex-wrap justify-center gap-4 sm:grid-cols-2">
                            {groups
                              .filter((match) =>
                                memberGroupIds.includes(match.id)
                              )
                              .map((group) => (
                                <GroupCard
                                  key={group.id}
                                  group={group as Group}
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
  highlightCards?: string[]
  pinned?: boolean
}) {
  const {
    group,
    creator,
    user,
    isMember,
    className,
    onGroupClick,
    highlightCards,
    pinned,
  } = props
  return (
    <Card
      className={clsx(
        'hover:bg-ink-100 bg-canvas-0 relative min-w-[20rem] gap-1 rounded-xl  p-6',
        className,
        highlightCards?.includes(group.id) &&
          '!bg-primary-100 outline-primary-500 outline outline-2'
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
        <Row className="text-ink-500 text-sm">
          <GroupMembersList group={group} />
        </Row>
        <Row>
          <div className="text-ink-500 text-sm">{group.about}</div>
        </Row>
      </Link>
      {isMember != null && user != null && (
        <Row className={'z-10 mt-2 w-full justify-end'}>
          <JoinOrLeaveGroupButton
            group={group}
            className={'z-10 w-24'}
            user={user}
            isMember={isMember}
          />
        </Row>
      )}
    </Card>
  )
}

export function GroupMembersList(props: { group: Group }) {
  const { group } = props
  const { totalMembers } = group
  if (totalMembers === 1) return <div />
  return (
    <div className="text-ink-700 flex flex-wrap gap-1">
      <span>{totalMembers} followers</span>
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
