import { sortBy, debounce } from 'lodash'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Group } from 'common/group'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { UserLink } from 'web/components/user-page'
import { useGroups, useMemberGroupIds } from 'web/hooks/use-group'
import { useUser } from 'web/hooks/use-user'
import { groupPath, listAllGroups } from 'web/lib/firebase/groups'
import { getUser, User } from 'web/lib/firebase/users'
import { Tabs } from 'web/components/layout/tabs'

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
  // Copied from contracts-list.tsx; extract if we copy this again
  const queryWords = query.toLowerCase().split(' ')
  function check(corpus: string) {
    return queryWords.every((word) => corpus.toLowerCase().includes(word))
  }

  // List member groups first, then groups with the highest question count, then highest member count
  const matches = sortBy(groups, [
    (group) => !memberGroupIds.includes(group.id),
    (group) => -1 * group.contractIds.length,
    (group) => -1 * group.memberIds.length,
  ]).filter(
    (g) =>
      check(g.name) ||
      check(g.about || '') ||
      check(creatorsDict[g.creatorId].username)
  )

  const matchesOrderedByRecentActivity = sortBy(groups, [
    (group) => -1 * group.mostRecentActivityTime,
  ]).filter(
    (g) =>
      check(g.name) ||
      check(g.about || '') ||
      check(creatorsDict[g.creatorId].username)
  )

  // Not strictly necessary, but makes the "hold delete" experience less laggy
  const debouncedQuery = debounce(setQuery, 50)

  return (
    <Page>
      <Col className="items-center">
        <Col className="w-full max-w-xl">
          <Col className="px-4 sm:px-0">
            <Row className="items-center justify-between">
              <Title text="Explore groups" />
              {user && <CreateGroupButton user={user} />}
            </Row>

            <div className="mb-6 text-gray-500">
              Groups enable users to curate, discuss, and rank in a subset of
              questions added solely by its members. Start a group today!
            </div>

            <Tabs
              tabs={[
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

                      <Col className="gap-4">
                        {matches.map((group) => (
                          <GroupCard
                            key={group.id}
                            group={group}
                            creator={creatorsDict[group.creatorId]}
                          />
                        ))}
                      </Col>
                    </Col>
                  ),
                },
              ]
                .concat(
                  user
                    ? {
                        title: 'My Groups',
                        content: (
                          <Col>
                            <input
                              type="text"
                              onChange={(e) => debouncedQuery(e.target.value)}
                              placeholder="Search your groups"
                              className="input input-bordered mb-4 w-full"
                            />

                            <Col className="gap-4">
                              {matchesOrderedByRecentActivity
                                .filter((match) =>
                                  match.memberIds.includes(user.id)
                                )
                                .map((group) => (
                                  <GroupCard
                                    key={group.id}
                                    group={group}
                                    creator={creatorsDict[group.creatorId]}
                                  />
                                ))}
                            </Col>
                          </Col>
                        ),
                      }
                    : []
                )
                .reverse()}
            />
          </Col>
        </Col>
      </Col>
    </Page>
  )
}

export function GroupCard(props: { group: Group; creator: User | undefined }) {
  const { group, creator } = props
  return (
    <Col
      key={group.id}
      className="relative gap-1 rounded-xl bg-white p-8 shadow-md hover:bg-gray-100"
    >
      <Link href={groupPath(group.slug)}>
        <a className="absolute left-0 right-0 top-0 bottom-0" />
      </Link>
      <Row className="items-center justify-between gap-2">
        <span className="text-xl">{group.name}</span>
      </Row>
      <div className="flex flex-col items-start justify-start gap-2 text-sm text-gray-500 sm:flex-row">
        <div>
          {group.contractIds.length} questions
          <span className={'sm:hidden'}>
            <span className={'mx-2'}>•</span>
            {group.memberIds.length} members
          </span>
        </div>
        <div className={'hidden sm:block'}>
          •<span className={'mx-2'}>{group.memberIds.length} members</span>
          <span>•</span>
        </div>
        <Row>
          <div className="mr-1">Created by</div>
          <UserLink
            className="text-neutral"
            name={creator?.name ?? ''}
            username={creator?.username ?? ''}
          />
        </Row>
      </div>
      <div className="text-sm text-gray-500">{group.about}</div>
    </Col>
  )
}
