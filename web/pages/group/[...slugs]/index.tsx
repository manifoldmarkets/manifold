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
import { useGroup } from 'web/hooks/use-group'
import { useRouter } from 'next/router'
import { scoreCreators, scoreTraders } from 'common/scoring'
import { Leaderboard } from 'web/components/leaderboard'
import { formatMoney } from 'common/util/format'
import { EditGroupButton } from 'web/components/groups/edit-group-button'
import Custom404 from '../../404'
import { SEO } from 'web/components/SEO'
import { Linkify } from 'web/components/linkify'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { findActiveContracts } from 'web/components/feed/find-active-contracts'
import { Tabs } from 'web/components/layout/tabs'
import { ContractsGrid } from 'web/components/contract/contracts-list'
import { CreateQuestionButton } from 'web/components/create-question-button'
import { useEffect, useState } from 'react'
import { Discussion } from 'web/components/groups/Discussion'
import { listenForCommentsOnGroup } from 'web/lib/firebase/comments'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const group = await getGroupBySlug(slugs[0])
  const creatorPromise = group ? getUser(group.creatorId) : null

  const contracts = group ? await getGroupContracts(group).catch((_) => []) : []

  const bets = await Promise.all(
    contracts.map((contract: Contract) => listAllBets(contract.id))
  )

  let activeContracts = findActiveContracts(contracts, [], flatten(bets), {})
  const [resolved, unresolved] = partition(
    activeContracts,
    ({ isResolved }) => isResolved
  )
  activeContracts = [...unresolved, ...resolved]

  // TODO: this only counts binary market pools.
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
      activeContracts,
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
const groupSubpages = [
  undefined,
  'discussion',
  'questions',
  'rankings',
] as const

export default function GroupPage(props: {
  group: Group | null
  creator: User
  contracts: Contract[]
  activeContracts: Contract[]
  activeContractBets: Bet[][]
  activeContractComments: Comment[][]
  traderScores: { [userId: string]: number }
  topTraders: User[]
  creatorScores: { [userId: string]: number }
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    group: null,
    creator: null,
    contracts: [],
    activeContracts: [],
    activeContractBets: [],
    activeContractComments: [],
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
  const [messages, setMessages] = useState<Comment[]>([])
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
    <Col className="mt-6 gap-12">
      <GroupOverview group={group} creator={creator} isCreator={!!isCreator} />
      <YourPerformance
        traderScores={traderScores}
        creatorScores={creatorScores}
        user={user}
      />
    </Col>
  )

  const leaderboardsTab = (
    <Col className="gap-8 px-4 lg:flex-row">
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
        <Row className={'mb-4 items-center justify-between'}>
          <Title className="" text={group.name} />
          {user && memberIds.includes(user.id) && (
            <CreateQuestionButton
              user={user}
              overrideText={'Add a question'}
              className={'w-40'}
              query={`?groupId=${group.id}`}
            />
          )}
        </Row>
      </div>

      <Tabs
        defaultIndex={page === 'rankings' ? 1 : 0}
        tabs={[
          {
            title: 'Discussion',
            content: (
              <Discussion messages={messages} user={user} group={group} />
            ),
            href: groupPath(group.slug, 'discussion'),
          },
          {
            title: 'Questions',
            content: (
              <div className={'mt-2'}>
                {contracts.length > 0 && (
                  <ContractsGrid
                    contracts={contracts}
                    hasMore={false}
                    loadMore={() => {}}
                  />
                )}
              </div>
            ),
            href: groupPath(group.slug, 'questions'),
          },
          {
            title: 'Rankings',
            content: leaderboardsTab,
            href: groupPath(group.slug, 'rankings'),
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
  const { about, memberIds } = group
  const [members, setMembers] = useState<User[]>([])
  useEffect(() => {
    if (memberIds.length > 1)
      // get users via their user ids:
      Promise.all(
        memberIds.filter((mId) => mId !== creator.id).map(getUser)
      ).then((users) => {
        const members = users.filter((user) => user)
        setMembers(members)
      })
  }, [memberIds])

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
        <Row>
          {group.memberIds.length > 1 && (
            <>
              <div className="mr-1 text-gray-500">Other members</div>
              <div className={'mt-0 grid grid-cols-4 gap-1'}>
                {members.map((member) => (
                  <UserLink
                    className="text-neutral col-span-2"
                    name={member.name}
                    username={member.username}
                  />
                ))}
              </div>
            </>
          )}
        </Row>

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
