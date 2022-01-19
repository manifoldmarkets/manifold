import { Fold } from '../../../common/fold'
import { Comment } from '../../../common/comment'
import { Page } from '../../components/page'
import { Title } from '../../components/title'
import { Bet, listAllBets } from '../../lib/firebase/bets'
import { getRecentComments, listAllComments } from '../../lib/firebase/comments'
import { Contract } from '../../lib/firebase/contracts'
import { getFoldBySlug, getFoldContracts } from '../../lib/firebase/folds'
import { ActivityFeed, findActiveContracts } from '../activity'

export async function getStaticProps(props: { params: { foldSlug: string } }) {
  const { foldSlug } = props.params

  const recentCommentsPromise = getRecentComments().catch(() => [])

  const fold = await getFoldBySlug(foldSlug)
  const contracts = fold ? await getFoldContracts(fold) : []

  const recentComments = await recentCommentsPromise
  const activeContracts = findActiveContracts(contracts, recentComments)
  const activeContractBets = await Promise.all(
    activeContracts.map((contract) => listAllBets(contract.id))
  )
  const activeContractComments = await Promise.all(
    activeContracts.map((contract) => listAllComments(contract.id))
  )

  return {
    props: {
      fold,
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
  activeContracts: Contract[]
  activeContractBets: Bet[][]
  activeContractComments: Comment[][]
}) {
  const { fold, activeContracts, activeContractBets, activeContractComments } =
    props

  return (
    <Page>
      <Title text={fold.name} />
      <ActivityFeed
        contracts={activeContracts}
        contractBets={activeContractBets}
        contractComments={activeContractComments}
      />
    </Page>
  )
}
