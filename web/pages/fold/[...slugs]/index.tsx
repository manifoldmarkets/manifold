import _ from 'lodash'
import Link from 'next/link'

import { Fold } from '../../../../common/fold'
import { Comment } from '../../../../common/comment'
import { Page } from '../../../components/page'
import { Title } from '../../../components/title'
import { Bet, listAllBets } from '../../../lib/firebase/bets'
import { listAllComments } from '../../../lib/firebase/comments'
import { Contract } from '../../../lib/firebase/contracts'
import {
  foldPath,
  getFoldBySlug,
  getFoldContracts,
} from '../../../lib/firebase/folds'
import { ActivityFeed, findActiveContracts } from '../../activity'
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
import { scoreCreators, scoreTraders } from '../../../lib/firebase/scoring'
import { Leaderboard } from '../../../components/leaderboard'
import { formatMoney } from '../../../lib/util/format'
import { EditFoldButton } from '../../../components/edit-fold-button'
import Custom404 from '../../404'

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const fold = await getFoldBySlug(slugs[0])
  const curatorPromise = fold ? getUser(fold.curatorId) : null

  const contracts = fold ? await getFoldContracts(fold).catch((_) => []) : []
  const contractComments = await Promise.all(
    contracts.map((contract) => listAllComments(contract.id).catch((_) => []))
  )

  let activeContracts = findActiveContracts(
    contracts,
    _.flatten(contractComments),
    365
  )
  const [resolved, unresolved] = _.partition(
    activeContracts,
    ({ isResolved }) => isResolved
  )
  activeContracts = [...unresolved, ...resolved]

  const activeContractBets = await Promise.all(
    activeContracts.map((contract) => listAllBets(contract.id).catch((_) => []))
  )
  const activeContractComments = activeContracts.map(
    (contract) =>
      contractComments[contracts.findIndex((c) => c.id === contract.id)]
  )

  const curator = await curatorPromise

  const bets = await Promise.all(
    contracts.map((contract) => listAllBets(contract.id))
  )

  const creatorScores = scoreCreators(contracts, bets)
  const [topCreators, topCreatorScores] = await toUserScores(creatorScores)

  const traderScores = scoreTraders(contracts, bets)
  const [topTraders, topTraderScores] = await toUserScores(traderScores)

  return {
    props: {
      fold,
      curator,
      contracts,
      activeContracts,
      activeContractBets,
      activeContractComments,
      topTraders,
      topTraderScores,
      topCreators,
      topCreatorScores,
    },

    revalidate: 60, // regenerate after a minute
  }
}

async function toUserScores(userScores: { [userId: string]: number }) {
  const topUserPairs = _.take(
    _.sortBy(Object.entries(userScores), ([_, score]) => -1 * score),
    10
  )
  const topUsers = await Promise.all(
    topUserPairs.map(([userId]) => getUser(userId))
  )
  const topUserScores = topUserPairs.map(([_, score]) => score)
  return [topUsers, topUserScores] as const
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
  topTraders: User[]
  topTraderScores: number[]
  topCreators: User[]
  topCreatorScores: number[]
}) {
  const {
    curator,
    contracts,
    activeContracts,
    activeContractBets,
    activeContractComments,
    topTraders,
    topTraderScores,
    topCreators,
    topCreatorScores,
  } = props

  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }

  const page = (slugs[1] ?? 'activity') as typeof foldSubpages[number]

  const fold = useFold(props.fold?.id ?? '') ?? props.fold

  const { query, setQuery, sort, setSort } = useQueryAndSortParams({
    defaultSort: 'most-traded',
  })

  const user = useUser()
  const isCurator = user && fold && user.id === fold.curatorId

  if (fold === null || !foldSubpages.includes(page) || slugs[2]) {
    return <Custom404 />
  }

  return (
    <Page wide>
      <Col className="items-center">
        <Col className="max-w-5xl w-full">
          <Col className="sm:flex-row sm:justify-between sm:items-end gap-4 mb-6">
            <Title className="!m-0" text={fold.name} />
            {isCurator && <EditFoldButton fold={fold} />}
          </Col>

          <div className="tabs mb-4">
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

          {page === 'activity' && (
            <Row className="gap-8">
              <Col>
                <ActivityFeed
                  contracts={activeContracts}
                  contractBets={activeContractBets}
                  contractComments={activeContractComments}
                />
              </Col>
              <Col className="hidden md:flex max-w-xs gap-10">
                <FoldOverview fold={fold} curator={curator} />
                <FoldLeaderboards
                  topTraders={topTraders}
                  topTraderScores={topTraderScores}
                  topCreators={topCreators}
                  topCreatorScores={topCreatorScores}
                />
              </Col>
            </Row>
          )}

          {page === 'markets' && (
            <div className="w-full">
              <SearchableGrid
                contracts={contracts}
                query={query}
                setQuery={setQuery}
                sort={sort}
                setSort={setSort}
              />
            </div>
          )}

          {page === 'leaderboards' && (
            <Col className="gap-8 lg:flex-row">
              <FoldLeaderboards
                topTraders={topTraders}
                topTraderScores={topTraderScores}
                topCreators={topCreators}
                topCreatorScores={topCreatorScores}
              />
            </Col>
          )}
        </Col>
      </Col>
    </Page>
  )
}

function FoldOverview(props: { fold: Fold; curator: User }) {
  const { fold, curator } = props
  const { about, tags } = fold

  return (
    <Col className="max-w-sm">
      <div className="px-4 py-3 bg-indigo-700 text-white text-sm rounded-t">
        About community
      </div>
      <Col className="p-4 bg-white self-start gap-2 rounded-b">
        <Row>
          <div className="text-gray-500 mr-1">Curated by</div>
          <UserLink
            className="text-neutral"
            name={curator.name}
            username={curator.username}
          />
        </Row>

        {about && (
          <>
            <Spacer h={2} />
            <div className="text-gray-500">{about}</div>
          </>
        )}

        <Spacer h={2} />

        <TagsList tags={tags.map((tag) => `#${tag}`)} />
      </Col>
    </Col>
  )
}

function FoldLeaderboards(props: {
  topTraders: User[]
  topTraderScores: number[]
  topCreators: User[]
  topCreatorScores: number[]
}) {
  const { topTraders, topTraderScores, topCreators, topCreatorScores } = props
  return (
    <>
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
            header: 'Market pool',
            renderCell: (user) =>
              formatMoney(topCreatorScores[topCreators.indexOf(user)]),
          },
        ]}
      />
    </>
  )
}
