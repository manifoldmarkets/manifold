import { flatten, take, partition, sortBy } from 'lodash'

import { Group } from 'common/group'
import { Comment } from 'common/comment'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { Bet, listAllBets } from 'web/lib/firebase/bets'
import { Contract } from 'web/lib/firebase/contracts'
import {
  groupPath,
  getGroupBySlug,
  getGroupContracts,
} from 'web/lib/firebase/groups'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/user-page'
import { getUser, User } from 'web/lib/firebase/users'
import { Spacer } from 'web/components/layout/spacer'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { useGroup, useMembers } from 'web/hooks/use-group'
import { useRouter } from 'next/router'
import { scoreCreators, scoreTraders } from 'common/scoring'
import { Leaderboard } from 'web/components/leaderboard'
import { formatMoney } from 'common/util/format'
import { EditGroupButton } from 'web/components/groups/edit-group-button'
import Custom404 from '../../404'
import { SEO } from 'web/components/SEO'
import { Linkify } from 'web/components/linkify'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { Tabs } from 'web/components/layout/tabs'
import { ContractsGrid } from 'web/components/contract/contracts-list'
import { CreateQuestionButton } from 'web/components/create-question-button'
import React, { useEffect, useState } from 'react'
import { Discussion } from 'web/components/groups/Discussion'
import { listenForCommentsOnGroup } from 'web/lib/firebase/comments'
import { LoadingIndicator } from 'web/components/loading-indicator'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const group = await getGroupBySlug(slugs[0])
  const creatorPromise = group ? getUser(group.creatorId) : null

  const contracts = group ? await getGroupContracts(group).catch((_) => []) : []

  const bets = await Promise.all(
    contracts.map((contract: Contract) => listAllBets(contract.id))
  )

  const creatorScores = scoreCreators(contracts)
  const traderScores = scoreTraders(contracts, bets)
  const [topCreators, topTraders] = await Promise.all([
    toTopUsers(creatorScores),
    toTopUsers(traderScores),
  ])

  const creator = await creatorPromise

  return {
    props: {
      group,
      creator,
      contracts,
      traderScores,
      topTraders,
      creatorScores,
      topCreators,
    },

    revalidate: 60, // regenerate after a minute
  }
}

async function toTopUsers(userScores: { [userId: string]: number }) {
  const topUserPairs = take(
    sortBy(Object.entries(userScores), ([_, score]) => -1 * score),
    10
  ).filter(([_, score]) => score >= 0.5)

  const topUsers = await Promise.all(
    topUserPairs.map(([userId]) => getUser(userId))
  )
  return topUsers.filter((user) => user)
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const groupSubpages = [undefined, 'discussion', 'questions', 'details'] as const

export default function GroupPage(props: {
  group: Group | null
  creator: User
  contracts: Contract[]
  traderScores: { [userId: string]: number }
  topTraders: User[]
  creatorScores: { [userId: string]: number }
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    group: null,
    creator: null,
    contracts: [],
    traderScores: {},
    topTraders: [],
    creatorScores: {},
    topCreators: [],
  }
  const {
    creator,
    traderScores,
    topTraders,
    creatorScores,
    topCreators,
    contracts,
  } = props

  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }
  const page = (slugs?.[1] ?? 'discussion') as typeof groupSubpages[number]

  const group = useGroup(props.group?.id) ?? props.group
  const [messages, setMessages] = useState<Comment[] | undefined>(undefined)
  useEffect(() => {
    if (group) listenForCommentsOnGroup(group.id, setMessages)
  }, [group])

  const user = useUser()
  const isCreator = user && group && user.id === group.creatorId

  if (group === null || !groupSubpages.includes(page) || slugs[2]) {
    return <Custom404 />
  }
  const { memberIds } = group

  const rightSidebar = (
    <Col className="mt-6 hidden xl:block">
      <GroupOverview group={group} creator={creator} isCreator={!!isCreator} />
      <YourPerformance
        traderScores={traderScores}
        creatorScores={creatorScores}
        user={user}
      />
      {contracts.length > 0 && (
        <div className={'mt-2'}>
          <div className={'my-2 text-lg text-indigo-700'}>Recent Questions</div>
          <ContractsGrid
            contracts={contracts
              .sort((a, b) => b.createdTime - a.createdTime)
              .slice(0, 3)}
            hasMore={false}
            loadMore={() => {}}
            className={'grid w-full grid-cols-1 gap-4'}
          />
        </div>
      )}
    </Col>
  )

  const leaderboardsTab = (
    <Col className="mt-4 gap-8 px-4 lg:flex-row">
      <GroupLeaderboards
        traderScores={traderScores}
        creatorScores={creatorScores}
        topTraders={topTraders}
        topCreators={topCreators}
        user={user}
      />
    </Col>
  )
  return (
    <Page rightSidebar={rightSidebar}>
      <SEO
        title={group.name}
        description={`Created by ${creator.name}. ${group.about}`}
        url={groupPath(group.slug)}
      />

      <div className="px-3 lg:px-1">
        <Row className={' items-center justify-between gap-4 '}>
          <Title className={'line-clamp-2'} text={group.name} />
          {user && memberIds.includes(user.id) && (
            <CreateQuestionButton
              user={user}
              overrideText={'Add a question'}
              className={'w-40 flex-shrink-0'}
              query={`?groupId=${group.id}`}
            />
          )}
        </Row>
      </div>

      <Tabs
        defaultIndex={page === 'details' ? 2 : page === 'questions' ? 1 : 0}
        tabs={[
          {
            title: 'Discussion',
            content: messages ? (
              <Discussion messages={messages} user={user} group={group} />
            ) : (
              <LoadingIndicator />
            ),
            href: groupPath(group.slug, 'discussion'),
          },
          {
            title: 'Questions',
            content: (
              <div className={'mt-2'}>
                {contracts.length > 0 ? (
                  <ContractsGrid
                    contracts={contracts}
                    hasMore={false}
                    loadMore={() => {}}
                  />
                ) : (
                  <div className="p-2 text-gray-500">
                    No questions yet. 🦗... Why not add one?
                  </div>
                )}
              </div>
            ),
            href: groupPath(group.slug, 'questions'),
          },
          {
            title: 'Details',
            content: (
              <>
                <div className={'xl:hidden'}>
                  <GroupOverview
                    group={group}
                    creator={creator}
                    isCreator={!!isCreator}
                  />
                  <YourPerformance
                    traderScores={traderScores}
                    creatorScores={creatorScores}
                    user={user}
                  />
                </div>
                {leaderboardsTab}
              </>
            ),
            href: groupPath(group.slug, 'details'),
          },
        ]}
      />
    </Page>
  )
}

function GroupOverview(props: {
  group: Group
  creator: User
  isCreator: boolean
}) {
  const { group, creator, isCreator } = props
  const { about } = group

  return (
    <Col>
      <Row className="items-center justify-end rounded-t bg-indigo-500 px-4 py-3 text-sm text-white">
        <Row className="flex-1 justify-start">About group</Row>
        {isCreator && <EditGroupButton className={'ml-1'} group={group} />}
      </Row>
      <Col className="gap-2 rounded-b bg-white p-4">
        <Row>
          <div className="mr-1 text-gray-500">Created by</div>
          <UserLink
            className="text-neutral"
            name={creator.name}
            username={creator.username}
          />
        </Row>
        <GroupMembersList group={group} />
        {about && (
          <>
            <Spacer h={2} />
            <div className="text-gray-500">
              <Linkify text={about} />
            </div>
          </>
        )}
      </Col>
    </Col>
  )
}

export function GroupMembersList(props: { group: Group }) {
  const { group } = props
  const members = useMembers(group)
  if (group.memberIds.length === 1) return <div />
  return (
    <div>
      <div>
        <div className="flex flex-wrap gap-1 text-gray-500">
          Other members
          {members.slice(0, members.length).map((member, i) => (
            <div key={member.id} className={'flex-shrink'}>
              <UserLink
                className="text-neutral "
                name={member.name}
                username={member.username}
              />
              {members.length > 1 && i !== members.length - 1 && <span>,</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function YourPerformance(props: {
  traderScores: { [userId: string]: number }
  creatorScores: { [userId: string]: number }

  user: User | null | undefined
}) {
  const { traderScores, creatorScores, user } = props

  const yourTraderScore = user ? traderScores[user.id] : undefined
  const yourCreatorScore = user ? creatorScores[user.id] : undefined

  return user ? (
    <Col>
      <div className="rounded bg-indigo-500 px-4 py-3 text-sm text-white">
        Your performance
      </div>
      <div className="bg-white p-2">
        <table className="table-compact table w-full text-gray-500">
          <tbody>
            <tr>
              <td>Total profit</td>
              <td>{formatMoney(yourTraderScore ?? 0)}</td>
            </tr>
            {yourCreatorScore && (
              <tr>
                <td>Total created pool</td>
                <td>{formatMoney(yourCreatorScore)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Col>
  ) : null
}

function GroupLeaderboards(props: {
  traderScores: { [userId: string]: number }
  creatorScores: { [userId: string]: number }
  topTraders: User[]
  topCreators: User[]
  user: User | null | undefined
}) {
  const { traderScores, creatorScores, topTraders, topCreators } = props

  const topTraderScores = topTraders.map((user) => traderScores[user.id])
  const topCreatorScores = topCreators.map((user) => creatorScores[user.id])

  return (
    <>
      <Leaderboard
        className="max-w-xl"
        title="🏅 Top bettors"
        users={topTraders}
        columns={[
          {
            header: 'Profit',
            renderCell: (user) =>
              formatMoney(topTraderScores[topTraders.indexOf(user)]),
          },
        ]}
      />

      <Leaderboard
        className="max-w-xl"
        title="🏅 Top creators"
        users={topCreators}
        columns={[
          {
            header: 'Market pool',
            renderCell: (user) =>
              formatMoney(topCreatorScores[topCreators.indexOf(user)]),
          },
        ]}
      />
    </>
  )
}
