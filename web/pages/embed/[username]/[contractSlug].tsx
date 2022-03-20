import { Answer } from '../../../../common/answer'
import { Bet } from '../../../../common/bet'
import { Comment } from '../../../../common/comment'
import { Contract } from '../../../../common/contract'
import { Fold } from '../../../../common/fold'
import { AnswersPanel } from '../../../components/answers/answers-panel'
import { ContractOverview } from '../../../components/contract-overview'
import { Col } from '../../../components/layout/col'
import { Spacer } from '../../../components/layout/spacer'
import { useContractWithPreload } from '../../../hooks/use-contract'
import { useFoldsWithTags } from '../../../hooks/use-fold'
import { fromPropz, usePropz } from '../../../hooks/use-propz'
import { useUser } from '../../../hooks/use-user'
import { listAllAnswers } from '../../../lib/firebase/answers'
import { listAllBets } from '../../../lib/firebase/bets'
import { listAllComments } from '../../../lib/firebase/comments'
import { getContractFromSlug } from '../../../lib/firebase/contracts'
import { getFoldsByTags } from '../../../lib/firebase/folds'
import Custom404 from '../../404'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { username, contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id

  const foldsPromise = getFoldsByTags(contract?.tags ?? [])

  const [bets, comments, answers] = await Promise.all([
    contractId ? listAllBets(contractId) : [],
    contractId ? listAllComments(contractId) : [],
    contractId && contract.outcomeType === 'FREE_RESPONSE'
      ? listAllAnswers(contractId)
      : [],
  ])

  const folds = await foldsPromise

  return {
    props: {
      contract,
      username,
      slug: contractSlug,
      bets,
      comments,
      answers,
      folds,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: {
  contract: Contract | null
  username: string
  bets: Bet[]
  comments: Comment[]
  answers: Answer[]
  slug: string
  folds: Fold[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    username: '',
    comments: [],
    answers: [],
    bets: [],
    slug: '',
    folds: [],
  }
  const user = useUser()

  const contract = useContractWithPreload(props.slug, props.contract)
  const { bets, comments } = props

  // Sort for now to see if bug is fixed.
  comments.sort((c1, c2) => c1.createdTime - c2.createdTime)
  bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)

  const folds = (useFoldsWithTags(contract?.tags) ?? props.folds).filter(
    (fold) => fold.followCount > 1 || user?.id === fold.curatorId
  )

  if (!contract) {
    return <Custom404 />
  }

  return (
    <Col className="w-full bg-white px-2 py-6 md:px-6 md:py-8">
      <ContractOverview
        contract={contract}
        bets={bets ?? []}
        comments={comments ?? []}
        folds={folds}
      >
        {contract.outcomeType === 'FREE_RESPONSE' && (
          <>
            <Spacer h={4} />
            <AnswersPanel contract={contract as any} answers={props.answers} />
            <Spacer h={4} />
            <div className="divider before:bg-gray-300 after:bg-gray-300" />
          </>
        )}
      </ContractOverview>
    </Col>
  )
}
