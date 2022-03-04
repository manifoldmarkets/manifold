import _ from 'lodash'
import Link from 'next/link'

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
import {
  ActivityFeed,
  findActiveContracts,
} from '../../../components/activity-feed'
import { TagsList } from '../../../components/tags-list'
import { Row } from '../../../components/layout/row'
import { UserLink } from '../../../components/user-page'
import { getUser, User } from '../../../lib/firebase/users'
import { Spacer } from '../../../components/layout/spacer'
import { Col } from '../../../components/layout/col'
import { useUser } from '../../../hooks/use-user'
import { useFold } from '../../../hooks/use-fold'
import { SearchableGrid } from '../../../components/contracts-list'
import { useQueryAndSortParams } from '../../../hooks/use-sort-and-query-params'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { scoreCreators, scoreTraders } from '../../../../common/scoring'
import { Leaderboard } from '../../../components/leaderboard'
import { formatMoney, toCamelCase } from '../../../../common/util/format'
import { EditFoldButton } from '../../../components/edit-fold-button'
import Custom404 from '../../404'
import { FollowFoldButton } from '../../../components/follow-fold-button'
import FeedCreate from '../../../components/feed-create'
import { SEO } from '../../../components/SEO'
import { useTaggedContracts } from '../../../hooks/use-contracts'
import { Linkify } from '../../../components/linkify'
import { filterDefined } from '../../../../common/util/array'
import { useRecentBets } from '../../../hooks/use-bets'
import { useRecentComments } from '../../../hooks/use-comments'
import { LoadingIndicator } from '../../../components/loading-indicator'

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const fold = await getFoldBySlug(slugs[0])
  const curatorPromise = fold ? getUser(fold.curatorId) : null

  const contracts = fold ? await getFoldContracts(fold).catch((_) => []) : []

  const bets = await Promise.all(
    contracts.map((contract) => listAllBets(contract.id))
  )

  let activeContracts = findActiveContracts(contracts, [], _.flatten(bets))
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
  const { curator, traderScores, topTraders, creatorScores, topCreators } =
    props

  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }

  const page = (slugs[1] ?? 'activity') as typeof foldSubpages[number]

  const fold = useFold(props.fold?.id) ?? props.fold

  const { query, setQuery, sort, setSort } = useQueryAndSortParams()

  const user = useUser()
  const isCurator = user && fold && user.id === fold.curatorId

  const taggedContracts = useTaggedContracts(fold?.tags) ?? props.contracts
  const contractsMap = _.fromPairs(
    taggedContracts.map((contract) => [contract.id, contract])
  )

  const contracts = filterDefined(
    props.contracts.map((contract) => contractsMap[contract.id])
  )
  const activeContracts = filterDefined(
    props.activeContracts.map((contract) => contractsMap[contract.id])
  )

  const recentBets = useRecentBets()
  const recentComments = useRecentComments()

  if (fold === null || !foldSubpages.includes(page) || slugs[2]) {
    return <Custom404 />
  }

  return (
    <Page wide>
      <SEO
        title={fold.name}
        description={`Curated by ${curator.name}. ${fold.about}`}
        url={foldPath(fold)}
      />

      <div className="px-3 lg:px-1">
        <Row className="mb-6 justify-between">
          <Title className="!m-0" text={fold.name} />
          {isCurator ? (
            <EditFoldButton className="ml-1" fold={fold} />
          ) : (
            <FollowFoldButton className="ml-1" fold={fold} />
          )}
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

      <div className="tabs mb-2">
        <Link href={foldPath(fold)} shallow>
          <a
            className={clsx(
              'tab tab-bordered',
              page === 'activity' && 'tab-active'
            )}
          >
            Activity
          </a>
        </Link>

        <Link href={foldPath(fold, 'markets')} shallow>
          <a
            className={clsx(
              'tab tab-bordered',
              page === 'markets' && 'tab-active'
            )}
          >
            Markets
          </a>
        </Link>
        <Link href={foldPath(fold, 'leaderboards')} shallow>
          <a
            className={clsx(
              'tab tab-bordered',
              page === 'leaderboards' && 'tab-active',
              page !== 'leaderboards' && 'md:hidden'
            )}
          >
            Leaderboards
          </a>
        </Link>
      </div>

      {(page === 'activity' || page === 'markets') && (
        <Row className={clsx(page === 'activity' ? 'gap-16' : 'gap-8')}>
          <Col className="flex-1">
            {user !== null && !fold.disallowMarketCreation && (
              <FeedCreate
                className={clsx('border-b-2', page !== 'activity' && 'hidden')}
                user={user}
                tag={toCamelCase(fold.name)}
                placeholder={`Type your question about ${fold.name}`}
              />
            )}
            {page === 'activity' ? (
              recentBets && recentComments ? (
                <>
                  <ActivityFeed
                    contracts={activeContracts}
                    recentBets={recentBets ?? []}
                    recentComments={recentComments ?? []}
                  />
                  {activeContracts.length === 0 && (
                    <div className="mx-2 mt-4 text-gray-500 lg:mx-0">
                      No activity from matching markets.{' '}
                      {isCurator && 'Try editing to add more tags!'}
                    </div>
                  )}
                </>
              ) : (
                <LoadingIndicator className="mt-4" />
              )
            ) : (
              <SearchableGrid
                contracts={contracts}
                query={query}
                setQuery={setQuery}
                sort={sort}
                setSort={setSort}
              />
            )}
          </Col>
          <Col className="hidden w-full max-w-xs gap-12 md:flex">
            <FoldOverview fold={fold} curator={curator} />
            <FoldLeaderboards
              traderScores={traderScores}
              creatorScores={creatorScores}
              topTraders={topTraders}
              topCreators={topCreators}
              user={user}
            />
          </Col>
        </Row>
      )}

      {page === 'leaderboards' && (
        <Col className="gap-8 px-4 lg:flex-row">
          <FoldLeaderboards
            traderScores={traderScores}
            creatorScores={creatorScores}
            topTraders={topTraders}
            topCreators={topCreators}
            user={user}
            yourPerformanceClassName="lg:hidden"
          />
        </Col>
      )}
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

function FoldLeaderboards(props: {
  traderScores: { [userId: string]: number }
  creatorScores: { [userId: string]: number }
  topTraders: User[]
  topCreators: User[]
  user: User | null | undefined
  yourPerformanceClassName?: string
}) {
  const {
    traderScores,
    creatorScores,
    topTraders,
    topCreators,
    user,
    yourPerformanceClassName,
  } = props

  const yourTraderScore = user ? traderScores[user.id] : undefined
  const yourCreatorScore = user ? creatorScores[user.id] : undefined

  const topTraderScores = topTraders.map((user) => traderScores[user.id])
  const topCreatorScores = topCreators.map((user) => creatorScores[user.id])

  return (
    <>
      {user && (
        <Col className={yourPerformanceClassName}>
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
      )}

      <Leaderboard
        className="max-w-xl"
        title="🏅 Top traders"
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
