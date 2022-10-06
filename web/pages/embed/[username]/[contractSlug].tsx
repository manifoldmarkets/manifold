import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { useEffect, useState } from 'react'
import { BetInline } from 'web/components/bet-inline'
import { Button } from 'web/components/button'
import {
  BinaryResolutionOrChance,
  ContractCard,
  FreeResponseResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
} from 'web/components/contract/contract-card'
import { MarketSubheader } from 'web/components/contract/contract-details'
import { ContractChart } from 'web/components/charts/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { SiteLink } from 'web/components/site-link'
import { useContractWithPreload } from 'web/hooks/use-contract'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { listAllBets } from 'web/lib/firebase/bets'
import {
  contractPath,
  getContractFromSlug,
  tradingAllowed,
} from 'web/lib/firebase/contracts'
import Custom404 from '../../404'
import { track } from 'web/lib/service/analytics'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id

  const bets = contractId ? await listAllBets(contractId) : []

  return {
    props: { contract, bets },
    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractEmbedPage(props: {
  contract: Contract | null
  bets: Bet[]
}) {
  props = usePropz(props, getStaticPropz) ?? { contract: null, bets: [] }

  const contract = useContractWithPreload(props.contract)
  const { bets } = props

  if (!contract) {
    return <Custom404 />
  }

  return <ContractEmbed contract={contract} bets={bets} />
}

interface EmbedProps {
  contract: Contract
  bets: Bet[]
}

export function ContractEmbed(props: EmbedProps) {
  const { contract } = props
  useEffect(() => {
    track('view market embed', {
      slug: contract.slug,
      contractId: contract.id,
      creatorId: contract.creatorId,
      hostname: window.location.hostname,
    })
  }, [contract.creatorId, contract.id, contract.slug])

  // return (height < 250px) ? Card : SmolView
  return (
    <>
      <div className="contents [@media(min-height:250px)]:hidden">
        <ContractCard
          contract={contract}
          className="h-screen"
          noLinkAvatar
          newTab
        />
      </div>
      <div className="hidden [@media(min-height:250px)]:contents">
        <ContractSmolView {...props} />
      </div>
    </>
  )
}

function ContractSmolView({ contract, bets }: EmbedProps) {
  const { question, outcomeType } = contract

  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  const href = `https://${DOMAIN}${contractPath(contract)}`

  const { setElem, width: graphWidth, height: graphHeight } = useMeasureSize()

  const [betPanelOpen, setBetPanelOpen] = useState(false)

  const [probAfter, setProbAfter] = useState<number>()

  return (
    <Col className="h-[100vh] w-full bg-white p-4">
      <Row className="justify-between gap-4 px-2">
        <div className="text-xl text-indigo-700 md:text-2xl">
          <SiteLink href={href}>{question}</SiteLink>
        </div>
        {isBinary && (
          <BinaryResolutionOrChance contract={contract} probAfter={probAfter} />
        )}

        {isPseudoNumeric && (
          <PseudoNumericResolutionOrExpectation contract={contract} />
        )}

        {outcomeType === 'FREE_RESPONSE' && (
          <FreeResponseResolutionOrChance contract={contract} truncate="long" />
        )}

        {outcomeType === 'NUMERIC' && (
          <NumericResolutionOrExpectation contract={contract} />
        )}
      </Row>
      <Spacer h={3} />
      <Row className="items-center justify-between gap-4 px-2">
        <MarketSubheader contract={contract} disabled />

        {(isBinary || isPseudoNumeric) &&
          tradingAllowed(contract) &&
          !betPanelOpen && (
            <Button color="gradient" onClick={() => setBetPanelOpen(true)}>
              Predict
            </Button>
          )}
      </Row>

      <Spacer h={2} />

      {(isBinary || isPseudoNumeric) && betPanelOpen && (
        <BetInline
          contract={contract as any}
          setProbAfter={setProbAfter}
          onClose={() => setBetPanelOpen(false)}
          className="self-center"
        />
      )}

      <div className="mx-1 mb-2 min-h-0 flex-1" ref={setElem}>
        {graphWidth != null && graphHeight != null && (
          <ContractChart
            contract={contract}
            bets={bets}
            width={graphWidth}
            height={graphHeight}
          />
        )}
      </div>
    </Col>
  )
}
