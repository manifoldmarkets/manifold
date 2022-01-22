import _ from 'lodash'
import { ArrowCircleLeftIcon } from '@heroicons/react/solid'

import { Col } from '../../../components/layout/col'
import { Leaderboard } from '../../../components/leaderboard'
import { Page } from '../../../components/page'
import { SiteLink } from '../../../components/site-link'
import { formatMoney } from '../../../lib/util/format'
import {
  foldPath,
  getFoldBySlug,
  getFoldContracts,
} from '../../../lib/firebase/folds'
import { Fold } from '../../../../common/fold'
import { Spacer } from '../../../components/layout/spacer'
import { scoreCreators, scoreTraders } from '../../../lib/firebase/scoring'
import { getUser, User } from '../../../lib/firebase/users'
import { listAllBets } from '../../../lib/firebase/bets'

export async function getStaticProps(props: { params: { foldSlug: string } }) {
  const { foldSlug } = props.params

  const fold = await getFoldBySlug(foldSlug)
  const contracts = fold ? await getFoldContracts(fold) : []
  const bets = await Promise.all(
    contracts.map((contract) => listAllBets(contract.id))
  )

  const creatorScores = scoreCreators(contracts, bets)
  const [topCreators, topCreatorScores] = await toUserScores(creatorScores)

  const traderScores = scoreTraders(contracts, bets)
  const [topTraders, topTraderScores] = await toUserScores(traderScores)

  return {
    props: { fold, topTraders, topTraderScores, topCreators, topCreatorScores },

    revalidate: 15 * 60, // regenerate after 15 minutes
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
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

export default function Leaderboards(props: {
  fold: Fold
  topTraders: User[]
  topTraderScores: number[]
  topCreators: User[]
  topCreatorScores: number[]
}) {
  const { fold, topTraders, topTraderScores, topCreators, topCreatorScores } =
    props
  return (
    <Page>
      <SiteLink href={foldPath(fold)}>
        <ArrowCircleLeftIcon className="h-5 w-5 text-gray-500 inline mr-1" />{' '}
        {fold.name}
      </SiteLink>

      <Spacer h={4} />

      <Col className="lg:flex-row gap-10">
        <Leaderboard
          title="🏅 Top traders"
          users={topTraders}
          columns={[
            {
              header: 'Total profit',
              renderCell: (user) =>
                formatMoney(topTraderScores[topTraders.indexOf(user)]),
            },
          ]}
        />
        <Leaderboard
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
      </Col>
    </Page>
  )
}
