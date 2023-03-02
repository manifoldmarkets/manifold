import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { useEffect } from 'react'
import {
  BinaryResolutionOrChance,
  ContractCard,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
} from 'web/components/contract/contract-card'
import { CloseOrResolveTime } from 'web/components/contract/contract-details'
import {
  BinaryContractChart,
  ChoiceContractChart,
  NumericContractChart,
  PseudoNumericContractChart,
} from 'web/components/charts/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { contractPath, getContractFromSlug } from 'web/lib/firebase/contracts'
import Custom404 from '../../404'
import { track } from 'web/lib/service/analytics'
import { useContract } from 'web/hooks/use-contracts'
import { useRouter } from 'next/router'
import { Avatar } from 'web/components/widgets/avatar'
import { OrderByDirection } from 'firebase/firestore'
import { useUser } from 'web/hooks/use-user'
import {
  HistoryPoint,
  useSingleValueHistoryChartViewScale,
} from 'web/components/charts/generic-charts'
import { getBets } from 'web/lib/supabase/bets'
import { NoSEO } from 'web/components/NoSEO'
import { ContractSEO } from 'web/pages/[username]/[contractSlug]'

type HistoryData = { bets?: Bet[]; points?: HistoryPoint<Partial<Bet>>[] }

const CONTRACT_BET_LOADING_OPTS = {
  filterRedemptions: true,
  filterChallenges: true,
}

async function getHistoryData(contract: Contract) {
  if (contract.outcomeType === 'NUMERIC') {
    return null
  }
  const bets = await getBets({
    contractId: contract.id,
    ...CONTRACT_BET_LOADING_OPTS,
    limit: 10000,
    order: 'desc' as OrderByDirection,
  })
  switch (contract.outcomeType) {
    case 'BINARY':
    case 'PSEUDO_NUMERIC':
      // We could include avatars in the embed, but not sure it's worth it
      const points = bets.map((bet) => ({
        x: bet.createdTime,
        y: bet.probAfter,
      }))
      return { points } as HistoryData
    default: // choice contracts
      return { bets } as HistoryData
  }
}

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  if (contract == null) {
    return { notFound: true, revalidate: 60 }
  }
  const historyData = await getHistoryData(contract)
  return {
    props: { contract, historyData },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractEmbedPage(props: {
  contract: Contract | null
  historyData: HistoryData | null
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    historyData: null,
  }

  const contract = useContract(props.contract?.id) ?? props.contract

  useEffect(() => {
    if (contract?.id)
      track('view market embed', {
        slug: contract.slug,
        contractId: contract.id,
        creatorId: contract.creatorId,
        hostname: window.location.hostname,
      })
  }, [contract?.creatorId, contract?.id, contract?.slug])

  const user = useUser()

  if (!contract) {
    return <Custom404 />
  }

  // return (height < 250px) ? Card : SmolView
  return (
    <>
      <NoSEO />
      <ContractSEO contract={contract} />
      <div className="contents [@media(min-height:250px)]:hidden">
        <ContractCard
          contract={contract}
          className="h-screen"
          noLinkAvatar
          newTab
          hideQuickBet={!user}
        />
      </div>
      <div className="hidden [@media(min-height:250px)]:contents">
        <ContractSmolView contract={contract} data={props.historyData} />
      </div>
    </>
  )
}

const ContractChart = (props: {
  contract: Contract
  data: HistoryData | null
  width: number
  height: number
  color?: string
}) => {
  const { contract, data, ...rest } = props
  const viewScale = useSingleValueHistoryChartViewScale()

  switch (contract.outcomeType) {
    case 'BINARY':
      return (
        <BinaryContractChart
          {...rest}
          viewScaleProps={viewScale}
          contract={contract}
          betPoints={data?.points ?? []}
        />
      )
    case 'PSEUDO_NUMERIC':
      return (
        <PseudoNumericContractChart
          {...rest}
          viewScaleProps={viewScale}
          contract={contract}
          betPoints={data?.points ?? []}
        />
      )
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE':
      return (
        <ChoiceContractChart
          {...rest}
          contract={contract}
          bets={data?.bets ?? []}
        />
      )
    case 'NUMERIC':
      return <NumericContractChart {...rest} contract={contract} />
    default:
      throw new Error('Contract outcome type not supported for chart')
  }
}

function ContractSmolView(props: {
  contract: Contract
  data: HistoryData | null
}) {
  const { contract, data } = props
  const { question, outcomeType } = contract

  const router = useRouter()
  const graphColor = router.query.graphColor as string
  const textColor = router.query.textColor as string

  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  const href = `https://${DOMAIN}${contractPath(contract)}`

  const { setElem, width: graphWidth, height: graphHeight } = useMeasureSize()
  const questionColor = textColor ?? 'rgb(67, 56, 202)' // text-primary-700

  return (
    <Col className="bg-canvas-0 h-[100vh] w-full p-4">
      <Row className="justify-between gap-4">
        <div>
          <a
            href={href}
            target="_blank"
            className="text-xl md:text-2xl"
            style={{ color: questionColor }}
          >
            {question}
          </a>
        </div>
        {isBinary && (
          <BinaryResolutionOrChance
            contract={contract}
            className="!flex-col !gap-0"
          />
        )}

        {isPseudoNumeric && (
          <PseudoNumericResolutionOrExpectation
            contract={contract}
            className="!flex-col !gap-0"
          />
        )}

        {outcomeType === 'NUMERIC' && (
          <NumericResolutionOrExpectation contract={contract} />
        )}
      </Row>
      <Details contract={contract} />

      <div className="min-h-0 flex-1" ref={setElem}>
        {graphWidth != null && graphHeight != null && (
          <ContractChart
            contract={contract}
            data={data}
            width={graphWidth}
            height={graphHeight}
            color={graphColor}
          />
        )}
      </div>
    </Col>
  )
}

const Details = (props: { contract: Contract }) => {
  const { creatorAvatarUrl, creatorUsername, creatorName, uniqueBettorCount } =
    props.contract

  return (
    <div className="text-ink-400 relative right-0 mt-2 flex flex-wrap items-center gap-4 text-xs">
      <span className="text-ink-600 flex gap-1">
        <Avatar
          size="2xs"
          avatarUrl={creatorAvatarUrl}
          username={creatorUsername}
          noLink
        />
        {creatorName}
      </span>
      <CloseOrResolveTime contract={props.contract} />
      <span>{uniqueBettorCount} traders</span>
    </div>
  )
}
