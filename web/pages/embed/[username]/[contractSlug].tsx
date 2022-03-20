import { Bet } from '../../../../common/bet'
import {
  Contract,
  DPM,
  FreeResponse,
  FullContract,
} from '../../../../common/contract'
import { AnswersGraph } from '../../../components/answers/answers-graph'
import {
  ResolutionOrChance,
  ContractDetails,
} from '../../../components/contract-card'
import { ContractProbGraph } from '../../../components/contract-prob-graph'
import { Col } from '../../../components/layout/col'
import { Row } from '../../../components/layout/row'
import { Spacer } from '../../../components/layout/spacer'
import { Linkify } from '../../../components/linkify'
import { useContractWithPreload } from '../../../hooks/use-contract'
import { fromPropz, usePropz } from '../../../hooks/use-propz'
import { listAllBets } from '../../../lib/firebase/bets'
import { getContractFromSlug } from '../../../lib/firebase/contracts'
import Custom404 from '../../404'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { username, contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id

  const bets = contractId ? await listAllBets(contractId) : []

  return {
    props: {
      contract,
      username,
      slug: contractSlug,
      bets,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractEmbedPage(props: {
  contract: Contract | null
  username: string
  bets: Bet[]
  slug: string
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    username: '',
    bets: [],
    slug: '',
  }

  const contract = useContractWithPreload(props.slug, props.contract)
  const { bets } = props

  bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)

  if (!contract) {
    return <Custom404 />
  }

  return <ContractEmbed contract={contract} bets={bets} />
}

function ContractEmbed(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props
  const { question, resolution, outcomeType } = contract

  const isBinary = outcomeType === 'BINARY'

  return (
    <Col className="w-full flex-1 bg-white py-2">
      <div className="px-3 text-xl md:text-2xl text-indigo-700">
        <Linkify text={question} />
      </div>

      <Spacer h={3} />

      <Row className="items-center justify-between gap-4 px-2">
        <ContractDetails contract={contract} isCreator={false} hideTweetBtn />

        {(isBinary || resolution) && <ResolutionOrChance contract={contract} />}
      </Row>

      <Spacer h={2} />

      <div className="mx-1">
        {isBinary ? (
          <ContractProbGraph contract={contract} bets={bets} />
        ) : (
          <AnswersGraph
            contract={contract as FullContract<DPM, FreeResponse>}
            bets={bets}
          />
        )}
      </div>
    </Col>
  )
}
