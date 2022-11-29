import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { useEffect } from 'react'
import { last } from 'lodash'
import {
  BinaryResolutionOrChance,
  ContractCard,
  FreeResponseResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
} from 'web/components/contract/contract-card'
import { CloseOrResolveTime } from 'web/components/contract/contract-details'
import { ContractChart } from 'web/components/charts/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { listBets } from 'web/lib/firebase/bets'
import { contractPath, getContractFromSlug } from 'web/lib/firebase/contracts'
import Custom404 from '../../404'
import { track } from 'web/lib/service/analytics'
import { useContract } from 'web/hooks/use-contracts'
import { useBets } from 'web/hooks/use-bets'
import { useRouter } from 'next/router'
import { Avatar } from 'web/components/widgets/avatar'

const CONTRACT_BET_LOADING_OPTS = {
  filterRedemptions: true,
  filterChallenges: true,
}

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id
  const bets = contractId
    ? await listBets({ contractId, ...CONTRACT_BET_LOADING_OPTS, limit: 4000 })
    : []

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
  const router = useRouter()

  const contract = useContract(props.contract?.id) ?? props.contract

  // static props load bets in ascending order by time
  const lastBetTime = last(props.bets)?.createdTime
  const newBets = useBets({
    ...CONTRACT_BET_LOADING_OPTS,
    contractId: contract?.id ?? '',
    afterTime: lastBetTime,
  })
  const bets = props.bets.concat(newBets ?? [])

  if (!contract) {
    return <Custom404 />
  }

  // Check ?graphColor=hex&textColor=hex from router
  const graphColor = router.query.graphColor as string
  const textColor = router.query.textColor as string
  const embedProps = { contract, bets, graphColor, textColor }

  return <ContractEmbed {...embedProps} />
}

interface EmbedProps {
  contract: Contract
  bets: Bet[]
  graphColor?: string
  textColor?: string
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

function ContractSmolView({
  contract,
  bets,
  graphColor,
  textColor,
}: EmbedProps) {
  const { question, outcomeType } = contract

  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  const href = `https://${DOMAIN}${contractPath(contract)}`

  const { setElem, width: graphWidth, height: graphHeight } = useMeasureSize()
  const questionColor = textColor ?? 'rgb(67, 56, 202)' // text-indigo-700

  return (
    <Col className="h-[100vh] w-full bg-white p-4">
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
        {isBinary && <BinaryResolutionOrChance contract={contract} />}

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
      <Details contract={contract} />

      <div className="min-h-0 flex-1" ref={setElem}>
        {graphWidth != null && graphHeight != null && (
          <ContractChart
            contract={contract}
            bets={bets}
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
  const { creatorAvatarUrl, creatorUsername, uniqueBettorCount } =
    props.contract

  return (
    <div className="relative right-0 mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-400">
      <span className="flex gap-1">
        <Avatar
          size="xxs"
          avatarUrl={creatorAvatarUrl}
          username={creatorUsername}
          noLink
        />
        {creatorUsername}
      </span>
      <CloseOrResolveTime contract={props.contract} isCreator disabled />
      <span>{uniqueBettorCount} traders</span>
    </div>
  )
}
