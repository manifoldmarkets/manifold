import _ from 'lodash'

import { Fold } from '../../../../common/fold'
import { Comment } from '../../../../common/comment'
import { Page } from '../../../components/page'
import { Title } from '../../../components/title'
import { Bet, listAllBets } from '../../../lib/firebase/bets'
import { Contract } from '../../../lib/firebase/contracts'
import {
  foldPath,
  getFoldBySlug,
  getFoldContracts,
} from '../../../lib/firebase/folds'
import { TagsList } from '../../../components/tags-list'
import { Row } from '../../../components/layout/row'
import { UserLink } from '../../../components/user-page'
import { getUser, User } from '../../../lib/firebase/users'
import { Spacer } from '../../../components/layout/spacer'
import { Col } from '../../../components/layout/col'
import { useUser } from '../../../hooks/use-user'
import { useFold } from '../../../hooks/use-fold'
import { useRouter } from 'next/router'
import { scoreCreators, scoreTraders } from '../../../../common/scoring'
import { Leaderboard } from '../../../components/leaderboard'
import { formatMoney } from '../../../../common/util/format'
import { EditFoldButton } from '../../../components/folds/edit-fold-button'
import Custom404 from '../../404'
import { FollowFoldButton } from '../../../components/folds/follow-fold-button'
import { SEO } from '../../../components/SEO'
import { useTaggedContracts } from '../../../hooks/use-contracts'
import { Linkify } from '../../../components/linkify'
import { fromPropz, usePropz } from '../../../hooks/use-propz'
import { filterDefined } from '../../../../common/util/array'
import { findActiveContracts } from '../../../components/feed/find-active-contracts'
import { Tabs } from '../../../components/layout/tabs'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const fold = await getFoldBySlug(slugs[0])
  const curatorPromise = fold ? getUser(fold.curatorId) : null

  const contracts = fold ? await getFoldContracts(fold).catch((_) => []) : []

  const bets = await Promise.all(
    contracts.map((contract) => listAllBets(contract.id))
  )

  let activeContracts = findActiveContracts(contracts, [], _.flatten(bets), {})
  const [resolved, unresolved] = _.partition(
    activeContracts,
    ({ isResolved }) => isResolved
  )
  activeContracts = [...unresolved, ...resolved]

  const creatorScores = scoreCreators(contracts, bets)
  const traderScores = scoreTraders(contracts, bets)
  const [topCreators, topTraders] = await Promise.all([
    toTopUsers(creatorScores),
    toTopUsers(traderScores),
  ])

  const curator = await curatorPromise

  return {
    props: {
      fold,
      curator,
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
  const topUserPairs = _.take(
    _.sortBy(Object.entries(userScores), ([_, score]) => -1 * score),
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
const foldSubpages = [undefined, 'activity', 'markets', 'leaderboards'] as const

export default function FoldPage(props: {
  fold: Fold | null
  curator: User
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
    fold: null,
    curator: null,
    contracts: [],
    activeContracts: [],
    activeContractBets: [],
    activeContractComments: [],
    traderScores: {},
    topTraders: [],
    creatorScores: {},
    topCreators: [],
  }
  const { curator, traderScores, topTraders, creatorScores, topCreators } =
    props

  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }

  const page = (slugs?.[1] ?? 'activity') as typeof foldSubpages[number]

  const fold = useFold(props.fold?.id) ?? props.fold

  const user = useUser()
  const isCurator = user && fold && user.id === fold.curatorId

  const taggedContracts = useTaggedContracts(fold?.tags) ?? props.contracts
  const contractsMap = _.fromPairs(
    taggedContracts.map((contract) => [contract.id, contract])
  )

  const contracts = filterDefined(
    props.contracts.map((contract) => contractsMap[contract.id])
  )

  if (fold === null || !foldSubpages.includes(page) || slugs[2]) {
    return <Custom404 />
  }

  const rightSidebar = (
    <Col className="mt-6 gap-12">
      <Row className="justify-end">
        {isCurator ? (
          <EditFoldButton className="ml-1" fold={fold} />
        ) : (
          <FollowFoldButton className="ml-1" fold={fold} />
        )}
      </Row>
      <FoldOverview fold={fold} curator={curator} />
      <YourPerformance
        traderScores={traderScores}
        creatorScores={creatorScores}
        user={user}
      />
    </Col>
  )

  const leaderboardsTab = (
    <Col className="gap-8 px-4 lg:flex-row">
      <FoldLeaderboards
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
        title={fold.name}
        description={`Curated by ${curator.name}. ${fold.about}`}
        url={foldPath(fold)}
      />

      <div className="px-3 lg:px-1">
        <Row className="mb-6 justify-between">
          <Title className="!m-0" text={fold.name} />
        </Row>

        <Col className="mb-6 gap-2 text-gray-500 md:hidden">
          <Row>
            <div className="mr-1">Curated by</div>
            <UserLink
              className="text-neutral"
              name={curator.name}
              username={curator.username}
            />
          </Row>
          <Linkify text={fold.about ?? ''} />
        </Col>
      </div>

      <Tabs
        defaultIndex={page === 'leaderboards' ? 1 : 0}
        tabs={[
          {
            title: 'Markets',
            content: <div>This view is deprecated.</div>,
            href: foldPath(fold, 'markets'),
          },
          {
            title: 'Leaderboards',
            content: leaderboardsTab,
            href: foldPath(fold, 'leaderboards'),
          },
        ]}
      />
    </Page>
  )
}

function FoldOverview(props: { fold: Fold; curator: User }) {
  const { fold, curator } = props
  const { about, tags } = fold

  return (
    <Col>
      <div className="rounded-t bg-indigo-500 px-4 py-3 text-sm text-white">
        About community
      </div>
      <Col className="gap-2 rounded-b bg-white p-4">
        <Row>
          <div className="mr-1 text-gray-500">Curated by</div>
          <UserLink
            className="text-neutral"
            name={curator.name}
            username={curator.username}
          />
        </Row>

        {about && (
          <>
            <Spacer h={2} />
            <div className="text-gray-500">
              <Linkify text={about} />
            </div>
          </>
        )}

        <div className="divider" />

        <div className="mb-2 text-gray-500">
          Includes markets matching any of these tags:
        </div>

        <TagsList tags={tags} noLabel />
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
              <td>Trading profit</td>
              <td>{formatMoney(yourTraderScore ?? 0)}</td>
            </tr>
            {yourCreatorScore && (
              <tr>
                <td>Created market vol</td>
                <td>{formatMoney(yourCreatorScore)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Col>
  ) : null
}

function FoldLeaderboards(props: {
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
            header: 'Market vol',
            renderCell: (user) =>
              formatMoney(topCreatorScores[topCreators.indexOf(user)]),
          },
        ]}
      />
    </>
  )
}
