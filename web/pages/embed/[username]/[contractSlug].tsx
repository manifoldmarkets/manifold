import { Contract, contractPath } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { useEffect } from 'react'
import { CloseOrResolveTime } from 'web/components/contract/contract-details'
import { BinaryContractChart } from 'web/components/charts/contract/binary'
import { NumericContractChart } from 'web/components/charts/contract/numeric'
import { PseudoNumericContractChart } from 'web/components/charts/contract/pseudo-numeric'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import Custom404 from '../../404'
import { track } from 'web/lib/service/analytics'
import { useRouter } from 'next/router'
import { Avatar } from 'web/components/widgets/avatar'
import { useSingleValueHistoryChartViewScale } from 'web/components/charts/generic-charts'
import { getBetFields } from 'web/lib/supabase/bets'
import { NoSEO } from 'web/components/NoSEO'
import { ContractSEO } from 'web/pages/[username]/[contractSlug]'
import { useIsDarkMode } from 'web/hooks/dark-mode-context'
import { StonkContractChart } from 'web/components/charts/contract/stonk'
import {
  BinaryResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
  StonkPrice,
} from 'web/components/contract/contract-price'
import { db } from 'web/lib/supabase/db'
import { getContractFromSlug } from 'common/supabase/contracts'
import { useFirebasePublicAndRealtimePrivateContract } from 'web/hooks/use-contract-supabase'
import { HistoryPoint } from 'common/chart'
import { ContractCardAnswers } from 'web/components/bet/quick-bet'
import { SizedContainer } from 'web/components/sized-container'
import clsx from 'clsx'

type Points = HistoryPoint<any>[]

async function getHistoryData(contract: Contract) {
  switch (contract.outcomeType) {
    case 'BINARY':
    case 'PSEUDO_NUMERIC': {
      const points = (
        await getBetFields(['createdTime', 'probAfter'], {
          contractId: contract.id,
          filterRedemptions: true,
          filterChallenges: true,
          limit: 50000,
          order: 'desc',
        })
      ).map((bet) => ({
        x: bet.createdTime,
        y: bet.probAfter,
      }))
      return points
    }

    default:
      return null
  }
}

export async function getStaticProps(props: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug, db)) || null
  if (contract == null) {
    return { notFound: true, revalidate: 60 }
  }
  const points = await getHistoryData(contract)
  return {
    props: { contract, points },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractEmbedPage(props: {
  contract: Contract
  points: Points | null
}) {
  const contract =
    useFirebasePublicAndRealtimePrivateContract(
      props.contract.visibility,
      props.contract.id
    ) ?? props.contract

  useEffect(() => {
    if (contract?.id)
      track('view market embed', {
        slug: contract.slug,
        contractId: contract.id,
        creatorId: contract.creatorId,
        hostname: window.location.hostname,
      })
  }, [contract?.creatorId, contract?.id, contract?.slug])

  if (!contract) {
    return <Custom404 />
  }

  return (
    <>
      <NoSEO />
      <ContractSEO contract={contract} />
      <ContractSmolView contract={contract} points={props.points} />
    </>
  )
}

const ContractChart = (props: {
  contract: Contract
  points: Points | null
  width: number
  height: number
  color?: string
}) => {
  const { contract, points, ...rest } = props
  const viewScale = useSingleValueHistoryChartViewScale()

  switch (contract.outcomeType) {
    case 'BINARY':
      return (
        <BinaryContractChart
          {...rest}
          viewScaleProps={viewScale}
          contract={contract}
          betPoints={points ?? []}
        />
      )
    case 'PSEUDO_NUMERIC':
      return (
        <PseudoNumericContractChart
          {...rest}
          viewScaleProps={viewScale}
          contract={contract}
          betPoints={points ?? []}
        />
      )
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE':
      return (
        <ContractCardAnswers
          contract={contract}
          numAnswersFR={numBars(props.height)}
          className="h-full justify-center"
        />
      )

    case 'NUMERIC':
      return <NumericContractChart {...rest} contract={contract} />
    case 'STONK':
      return (
        <StonkContractChart
          {...rest}
          betPoints={points ?? []}
          viewScaleProps={viewScale}
          contract={contract}
        />
      )

    default:
      return null
  }
}

const numBars = (height: number) => {
  if (height < 120) return 2
  if (height < 150) return 3
  if (height < 180) return 4
  if (height < 210) return 5
  return 6
}

function ContractSmolView(props: {
  contract: Contract
  points: Points | null
}) {
  const { contract, points } = props
  const { question, outcomeType } = contract

  const router = useRouter()
  const graphColor = router.query.graphColor as string
  const textColor = router.query.textColor as string

  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isMulti =
    outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'FREE_RESPONSE'

  const href = `https://${DOMAIN}${contractPath(contract)}`

  const isDarkMode = useIsDarkMode()

  return (
    <Col className="bg-canvas-0 h-[100vh] w-full p-4">
      <Row className="justify-between gap-4">
        <div>
          <a
            href={href}
            target="_blank"
            className="text-primary-700 text-lg hover:underline sm:text-xl"
            style={{
              color: textColor,
              filter: isDarkMode && textColor ? 'invert(1)' : undefined,
            }}
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
        {outcomeType === 'STONK' && (
          <StonkPrice className="!flex-col !gap-0" contract={contract} />
        )}
      </Row>
      <Details contract={contract} />

      <SizedContainer
        className={clsx(
          'text-ink-1000 my-4 min-h-0 flex-1',
          !isMulti && 'pr-10'
        )}
      >
        {(w, h) => (
          <ContractChart
            contract={contract}
            points={points}
            width={w}
            height={h}
            color={graphColor}
          />
        )}
      </SizedContainer>
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
