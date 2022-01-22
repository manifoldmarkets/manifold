import _ from 'lodash'
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

export async function getStaticProps(props: { params: { foldSlug: string } }) {
  const { foldSlug } = props.params

  const fold = await getFoldBySlug(foldSlug)
  const curatorPromise = fold ? getUser(fold.curatorId) : null

  const contracts = fold ? await getFoldContracts(fold) : []
  const contractComments = await Promise.all(
    contracts.map((contract) => listAllComments(contract.id))
  )

  const activeContracts = findActiveContracts(
    contracts,
    _.flatten(contractComments)
  )
  const activeContractBets = await Promise.all(
    activeContracts.map((contract) => listAllBets(contract.id))
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
    fold,
    curator,
    activeContracts,
    activeContractBets,
    activeContractComments,
  } = props

  const { tags, curatorId } = fold

  const user = useUser()
  const isCurator = user?.id === curatorId

  return (
    <Page>
      <Col className="items-center">
        <Col className="max-w-3xl w-full">
          <Title text={fold.name} />

          <Row className="items-center gap-2 mb-2 flex-wrap">
            <SiteLink className="text-sm" href={foldPath(fold, 'markets')}>
              Markets
            </SiteLink>
            <div className="text-gray-500">•</div>
            <SiteLink className="text-sm" href={foldPath(fold, 'leaderboards')}>
              Leaderboards
            </SiteLink>
            <div className="text-gray-500">•</div>
            <Row>
              <div className="text-sm text-gray-500 mr-1">Curated by</div>
              <UserLink
                className="text-sm text-neutral"
                name={curator.name}
                username={curator.username}
              />
            </Row>
            {isCurator && (
              <>
                <div className="text-gray-500">•</div>
                <SiteLink className="text-sm " href={foldPath(fold, 'edit')}>
                  Edit
                </SiteLink>
              </>
            )}
          </Row>

          <TagsList tags={tags.map((tag) => `#${tag}`)} />

          <Spacer h={4} />

          <ActivityFeed
            contracts={activeContracts}
            contractBets={activeContractBets}
            contractComments={activeContractComments}
          />
        </Col>
      </Col>
    </Page>
  )
}
