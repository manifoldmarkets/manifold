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
import { SiteLink } from '../../../components/site-link'
import { useUser } from '../../../hooks/use-user'
import { useFold } from '../../../hooks/use-fold'

export async function getStaticProps(props: { params: { foldSlug: string } }) {
  const { foldSlug } = props.params

  const fold = await getFoldBySlug(foldSlug)
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

  return {
    props: {
      fold,
      curator,
      activeContracts,
      activeContractBets,
      activeContractComments,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function FoldPage(props: {
  fold: Fold
  curator: User
  activeContracts: Contract[]
  activeContractBets: Bet[][]
  activeContractComments: Comment[][]
}) {
  const {
    curator,
    activeContracts,
    activeContractBets,
    activeContractComments,
  } = props

  const fold = useFold(props.fold.id) ?? props.fold

  return (
    <Page wide>
      <Col className="items-center">
        <Col>
          <Title className="!mt-0" text={fold.name} />

          <div className="tabs mb-4">
            <div className="tab tab-bordered tab-active">Activity</div>

            <Link href={foldPath(fold, 'markets')}>
              <a className="tab tab-bordered">Markets</a>
            </Link>
            <Link href={foldPath(fold, 'leaderboards')}>
              <a className="tab tab-bordered ">Leaderboards</a>
            </Link>
          </div>

          <Row className="gap-8 bg-">
            <Col className="max-w-2xl w-full">
              <ActivityFeed
                contracts={activeContracts}
                contractBets={activeContractBets}
                contractComments={activeContractComments}
              />
            </Col>
            <FoldOverview fold={fold} curator={curator} />
          </Row>
        </Col>
      </Col>
    </Page>
  )
}

function FoldOverview(props: { fold: Fold; curator: User }) {
  const { fold, curator } = props
  const { tags, curatorId } = fold

  const user = useUser()
  const isCurator = user?.id === curatorId

  return (
    <Col style={{ maxWidth: 350 }}>
      <div className="px-4 py-3 bg-indigo-700 text-white text-sm rounded-t">
        About community
      </div>
      <Col className="p-4 bg-white self-start gap-2 rounded-b">
        {isCurator && (
          <SiteLink className="text-sm " href={foldPath(fold, 'edit')}>
            Edit
          </SiteLink>
        )}

        <Row>
          <div className="text-gray-500 mr-1">Curated by</div>
          <UserLink
            className="text-neutral"
            name={curator.name}
            username={curator.username}
          />
        </Row>

        <Spacer h={2} />
        <div className="text-gray-500">
          This is a community for predicting asdf asd fasdf asdf asdf .
        </div>

        <Spacer h={2} />

        <TagsList tags={tags.map((tag) => `#${tag}`)} />
      </Col>
    </Col>
  )
}
