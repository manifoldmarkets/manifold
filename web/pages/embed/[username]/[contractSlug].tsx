import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { useState } from 'react'
import { BetInline } from 'web/components/bet-inline'
import { Button } from 'web/components/button'
import {
  BinaryResolutionOrChance,
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
import { useTracking } from 'web/hooks/use-tracking'
import { listAllBets } from 'web/lib/firebase/bets'
import {
  contractPath,
  getContractFromSlug,
  tradingAllowed,
} from 'web/lib/firebase/contracts'
import Custom404 from '../../404'
import { useUser } from 'web/hooks/use-user'
import { QuickBet } from 'web/components/contract/quick-bet'
import { contractMetrics } from 'common/contract-details'
import Image from 'next/future/image'

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

export function ContractEmbed(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props
  const { question, outcomeType } = contract

  useTracking('view market embed', {
    slug: contract.slug,
    contractId: contract.id,
    creatorId: contract.creatorId,
  })

  const { creatorName, creatorUsername, creatorId, creatorAvatarUrl } = contract
  const { resolvedDate } = contractMetrics(contract)
  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  const href = `https://${DOMAIN}${contractPath(contract)}`

  const { setElem, width: graphWidth, height: graphHeight } = useMeasureSize()

  const [betPanelOpen, setBetPanelOpen] = useState(false)

  const [probAfter, setProbAfter] = useState<number>()

  const user = useUser()
  if (user && (isBinary || isPseudoNumeric)) {
    return (
      <Col className="border-greyscale-2 h-full w-full justify-between overflow-hidden rounded-lg border-2 bg-white p-4">
        <Row className="mb-1 justify-between">
          <MarketSubheader contract={contract} disabled />
          <SiteLink href={href} className="mt-0">
            <Image height={32} width={32} alt="Manifold logo" src="/logo.png" />
          </SiteLink>
        </Row>
        <SiteLink href={href} className="text-md text-indigo-700 md:text-xl">
          {question}
        </SiteLink>
        <Row>
          <div className="mx-1 mb-2 min-h-0 flex-1" ref={setElem}>
            <ContractChart contract={contract} bets={bets} height={150} />
          </div>
          <QuickBet
            user={user}
            contract={contract}
            noProbBar={true}
            className="mx-auto -mr-5"
          />
        </Row>
      </Col>
    )
  } else
    return (
      <Col className="border-greyscale-2 h-full w-full justify-between overflow-hidden rounded-lg border-2 bg-white p-4">
        <Row className="mb-1 justify-between">
          <MarketSubheader contract={contract} disabled />
          <SiteLink href={href} className="mt-0">
            <Image height={32} width={32} alt="Manifold logo" src="/logo.png" />
          </SiteLink>
        </Row>
        <Row className="justify-between gap-4">
          <Col>
            <div className="text-md text-indigo-700 md:text-xl">
              <SiteLink href={href}>{question}</SiteLink>
            </div>
          </Col>
          <Col>
            {!user && isBinary && (
              <BinaryResolutionOrChance
                contract={contract}
                probAfter={probAfter}
              />
            )}

            {!user && isPseudoNumeric && (
              <PseudoNumericResolutionOrExpectation contract={contract} />
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
            <Spacer h={3} />
          </Col>
        </Row>
        <div className="mx-1 mb-2 min-h-0 flex-1" ref={setElem}>
          <ContractChart contract={contract} bets={bets} height={150} />
        </div>
      </Col>
    )
}
