import clsx from 'clsx'
import { HistoryPoint } from 'common/chart'
import { Contract, contractPath } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { getContractFromSlug } from 'common/supabase/contracts'
import { formatMoney } from 'common/util/format'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { NoSEO } from 'web/components/NoSEO'
import { BinaryContractChart } from 'web/components/charts/contract/binary'
import { NumericContractChart } from 'web/components/charts/contract/numeric'
import { PseudoNumericContractChart } from 'web/components/charts/contract/pseudo-numeric'
import { StonkContractChart } from 'web/components/charts/contract/stonk'
import { useViewScale } from 'web/components/charts/generic-charts'
import { CloseOrResolveTime } from 'web/components/contract/contract-details'
import {
  BinaryResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
  StonkPrice,
} from 'web/components/contract/contract-price'
import { ContractSEO } from 'web/components/contract/contract-seo'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SizedContainer } from 'web/components/sized-container'
import { Avatar } from 'web/components/widgets/avatar'
import { useIsDarkMode } from 'web/hooks/dark-mode-context'
import { useNumContractComments } from 'web/hooks/use-comments-supabase'
import { track } from 'web/lib/service/analytics'
import { getBetFields } from 'web/lib/supabase/bets'
import { db } from 'web/lib/supabase/db'
import Custom404 from '../../404'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { AnswersPanel } from 'web/components/answers/answers-panel'

type Points = HistoryPoint<any>[]

export async function getHistoryData(
  contract: Contract,
  limit = 50000,
  afterTime?: number
) {
  switch (contract.outcomeType) {
    case 'BINARY':
    case 'PSEUDO_NUMERIC':
    case 'STONK': {
      // get the last 50k bets, then reverse them (so they're chronological)
      const points = (
        await getBetFields(['createdTime', 'probBefore', 'probAfter'], {
          contractId: contract.id,
          filterRedemptions: true,
          filterChallenges: true,
          limit,
          order: 'desc',
          afterTime,
        })
      )
        .map((bet) => ({
          x: bet.createdTime,
          y: bet.probAfter,
          yBefore: bet.probBefore,
        }))
        .reverse()
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
  const rawPoints = await getHistoryData(contract)
  const filteredPoints = rawPoints?.filter((point) => {
    x: point.x
    y: point.y
  })
  return {
    props: { contract, filteredPoints },
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
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract

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
  const viewScale = useViewScale()

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
        <div className="flex h-full flex-col justify-center">
          <AnswersPanel
            contract={contract}
            maxAnswers={numBars(props.height)}
            linkToContract
          />
        </div>
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
  if (height < 150) return 2
  if (height < 200) return 3
  if (height < 250) return 4
  if (height < 300) return 5
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
  const isBountiedQuestion = outcomeType === 'BOUNTIED_QUESTION'

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
            rel="noreferrer"
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
      {!isBountiedQuestion && (
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
      )}
      {isBountiedQuestion && (
        <Col className="relative h-full w-full">
          <Image
            className="mx-auto my-auto opacity-40"
            height={200}
            width={200}
            src={'/money-bag.svg'}
            alt={''}
          />
          <Col className="absolute top-12 bottom-0 left-0 right-0">
            <Col className="mx-auto my-auto text-center">
              <div className="text-3xl">{formatMoney(contract.bountyLeft)}</div>
              <div className="text-ink-500">bounty</div>
            </Col>
          </Col>
        </Col>
      )}
    </Col>
  )
}

const Details = (props: { contract: Contract }) => {
  const {
    creatorAvatarUrl,
    creatorUsername,
    creatorName,
    uniqueBettorCount,
    outcomeType,
  } = props.contract

  const isBountiedQuestion = outcomeType === 'BOUNTIED_QUESTION'
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
      {!isBountiedQuestion && (
        <>
          <CloseOrResolveTime contract={props.contract} />{' '}
          <span>{uniqueBettorCount} traders</span>
        </>
      )}
      {isBountiedQuestion && (
        <>
          <NumComments contract={props.contract} />
        </>
      )}
    </div>
  )
}

const NumComments = (props: { contract: Contract }) => {
  const { contract } = props
  const numComments = useNumContractComments(contract.id)
  return <span>{numComments} comments</span>
}
