import { Bet } from '../../../../common/bet'
import {
  Contract,
  DPM,
  FreeResponse,
  FullContract,
} from '../../../../common/contract'
import { DOMAIN } from '../../../../common/envs/constants'
import { AnswersGraph } from '../../../components/answers/answers-graph'
import {
  BinaryResolutionOrChance,
  ContractDetails,
  FreeResponseResolution,
} from '../../../components/contract/contract-card'
import { ContractProbGraph } from '../../../components/contract/contract-prob-graph'
import { Col } from '../../../components/layout/col'
import { Row } from '../../../components/layout/row'
import { Spacer } from '../../../components/layout/spacer'
import { Linkify } from '../../../components/linkify'
import { SiteLink } from '../../../components/site-link'
import { useContractWithPreload } from '../../../hooks/use-contract'
import { useMeasureSize } from '../../../hooks/use-measure-size'
import { fromPropz, usePropz } from '../../../hooks/use-propz'
import { useWindowSize } from '../../../hooks/use-window-size'
import { listAllBets } from '../../../lib/firebase/bets'
import {
  contractPath,
  getContractFromSlug,
} from '../../../lib/firebase/contracts'
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
        <SiteLink
          className="absolute top-0 left-0 z-20 h-full w-full"
          href={href}
        />

        <div className="px-3 text-xl text-indigo-700 md:text-2xl">
          <Linkify text={question} />
        </div>

        <Spacer h={3} />

        <Row className="items-center justify-between gap-4 px-2">
          <ContractDetails
            contract={contract}
            bets={bets}
            isCreator={false}
            hideShareButtons
          />

          {isBinary && <BinaryResolutionOrChance contract={contract} />}

          {outcomeType === 'FREE_RESPONSE' && resolution && (
            <FreeResponseResolution
              contract={contract}
              resolution={resolution}
              truncate="long"
            />
          )}
        </Row>

        <Spacer h={2} />
      </div>

      <div className="mx-1" style={{ paddingBottom }}>
        {isBinary ? (
          <ContractProbGraph
            contract={contract}
            bets={bets}
            height={graphHeight}
          />
        ) : (
          <AnswersGraph
            contract={contract as FullContract<DPM, FreeResponse>}
            bets={bets}
            height={graphHeight}
          />
        )}
      </div>
    </Col>
  )
}
