import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { AnswersGraph } from 'web/components/answers/answers-graph'
import BetRow from 'web/components/bet-row'
import {
  BinaryResolutionOrChance,
  FreeResponseResolutionOrChance,
  NumericResolutionOrExpectation,
} from 'web/components/contract/contract-card'
import { ContractDetails } from 'web/components/contract/contract-details'
import { ContractProbGraph } from 'web/components/contract/contract-prob-graph'
import { NumericGraph } from 'web/components/contract/numeric-graph'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { SiteLink } from 'web/components/site-link'
import { useContractWithPreload } from 'web/hooks/use-contract'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { useWindowSize } from 'web/hooks/use-window-size'
import { listAllBets } from 'web/lib/firebase/bets'
import { contractPath, getContractFromSlug } from 'web/lib/firebase/contracts'
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

  const contract = useContractWithPreload(props.contract)
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

  const href = `https://${DOMAIN}${contractPath(contract)}`

  const { height: windowHeight } = useWindowSize()
  const { setElem, height: topSectionHeight } = useMeasureSize()
  const paddingBottom = 8

  const graphHeight =
    windowHeight && topSectionHeight
      ? windowHeight - topSectionHeight - paddingBottom
      : 0

  return (
    <Col className="w-full flex-1 bg-white">
      <div className="relative flex flex-col pt-2" ref={setElem}>
        <div className="px-3 text-xl text-indigo-700 md:text-2xl">
          <SiteLink href={href}>{question}</SiteLink>
        </div>

        <Spacer h={3} />

        <Row className="items-center justify-between gap-4 px-2">
          <ContractDetails
            contract={contract}
            bets={bets}
            isCreator={false}
            disabled
          />

          {isBinary && (
            <Row className="items-center gap-4">
              // this fails typechecking, but it doesn't explode because we will
              never
              <BetRow contract={contract as any} betPanelClassName="scale-75" />
              <BinaryResolutionOrChance contract={contract} />
            </Row>
          )}

          {outcomeType === 'FREE_RESPONSE' && (
            <FreeResponseResolutionOrChance
              contract={contract}
              truncate="long"
            />
          )}

          {outcomeType === 'NUMERIC' && (
            <NumericResolutionOrExpectation contract={contract} />
          )}
        </Row>

        <Spacer h={2} />
      </div>

      <div className="mx-1" style={{ paddingBottom }}>
        {isBinary && (
          <ContractProbGraph
            contract={contract}
            bets={bets}
            height={graphHeight}
          />
        )}

        {outcomeType === 'FREE_RESPONSE' && (
          <AnswersGraph contract={contract} bets={bets} height={graphHeight} />
        )}

        {outcomeType === 'NUMERIC' && (
          <NumericGraph contract={contract} height={graphHeight} />
        )}
      </div>
    </Col>
  )
}
