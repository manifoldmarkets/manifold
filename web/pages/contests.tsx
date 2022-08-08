import { debounce, sortBy } from 'lodash'
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
import { SiteLink } from 'web/components/site-link'
import clsx from 'clsx'
import { Avatar } from 'web/components/avatar'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { UserLink } from 'web/components/user-page'
import { searchInAny } from 'common/util/parse'
import { SEO } from 'web/components/SEO'
import { CONTEST_SLUGS, contest_data } from 'common/contest'
import { contestPath } from 'web/lib/firebase/contests'

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

export default function Contests(props: {
  groups: Group[]
  creatorsDict: { [k: string]: User }
}) {
  const [creatorsDict, setCreatorsDict] = useState(props.creatorsDict)

  const contests = (useGroups() ?? props.groups).filter((group) =>
    CONTEST_SLUGS.includes(group.slug)
  )
  const user = useUser()

  // useEffect(() => {
  //   // Load User object for creator of new Groups.
  //   const newGroups = contests.filter(
  //     ({ creatorId }) => !creatorsDict[creatorId]
  //   )
  //   if (newGroups.length > 0) {
  //     Promise.all(newGroups.map(({ creatorId }) => getUser(creatorId))).then(
  //       (newUsers) => {
  //         const newUsersDict = Object.fromEntries(
  //           newUsers.map((user) => [user.id, user])
  //         )
  //         setCreatorsDict({ ...creatorsDict, ...newUsersDict })
  //       }
  //     )
  //   }
  // }, [creatorsDict, contests])

  const [query, setQuery] = useState('')

  // List groups with the highest question count, then highest member count
  // TODO use find-active-contracts to sort by?
  const matches = sortBy(contests, [
    (contest) => -1 * contest.contractIds.length,
    (contest) => -1 * contest.memberIds.length,
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
        title="Contests"
        description="Discuss real world contests. Vote on your favorite submissions, get rewarded in mana if you're right."
        url="/contests"
      />
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-4 sm:px-2">
          <Col className="mt-12 items-center">
            <img className="object-fit w-32" src="contests/ManiTrophy.png" />
            <Title text="Contests" />
          </Col>

          <div className="mb-6 text-gray-500">
            Discuss real world contests. Vote on your favorite submissions, get
            rewarded in mana if you're right.
          </div>

          <Col>
            <input
              type="text"
              onChange={(e) => debouncedQuery(e.target.value)}
              placeholder="Search contests"
              className="input input-bordered mb-4 w-full"
            />

            <div className="flex flex-wrap justify-center gap-4">
              {matches.map((contest) => (
                <ContestCard key={contest.id} contest={contest} />
              ))}
            </div>
          </Col>
        </Col>
      </Col>
    </Page>
  )
}

export function ContestCard(props: { contest: Group }) {
  const { contest } = props
  const slug = contest.slug
  return (
    <Col className="relative min-w-[20rem]  max-w-xs gap-1 rounded-xl bg-white p-8 shadow-md hover:shadow-xl">
      <Link href={contestPath(contest.slug)}>
        <a className="absolute left-0 right-0 top-0 bottom-0 z-0" />
      </Link>
      <img
        className="mb-2 h-24 w-24 self-center"
        src={`contests/${contest.slug}.png`}
      />
      <Row className="items-center justify-between gap-2">
        <span className="text-xl text-indigo-700">{contest.name}</span>
      </Row>
      <Row>
        <div className="text-sm text-gray-500">{contest.about}</div>
      </Row>
    </Col>
  )
}
