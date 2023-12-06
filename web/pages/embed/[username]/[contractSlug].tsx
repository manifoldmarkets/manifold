import clsx from 'clsx'
import { HistoryPoint } from 'common/chart'
import { Contract, contractPath } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { getContractFromSlug } from 'common/supabase/contracts'
import { formatMoney } from 'common/util/format'
import { getShareUrl } from 'common/util/share'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { NoSEO } from 'web/components/NoSEO'
import { SimpleAnswerBars } from 'web/components/answers/answers-panel'
import { BinaryContractChart } from 'web/components/charts/contract/binary'
import { NumericContractChart } from 'web/components/charts/contract/numeric'
import { PseudoNumericContractChart } from 'web/components/charts/contract/pseudo-numeric'
import { StonkContractChart } from 'web/components/charts/contract/stonk'
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
import { QRCode } from 'web/components/widgets/qr-code'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import Custom404 from '../../404'
import { ContractSummaryStats } from 'web/components/contract/contract-summary-stats'
import { PollPanel } from 'web/components/poll/poll-panel'
import { getBetPoints } from 'common/supabase/bets'
import { getInitialProbability } from 'common/calculate'

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
      const allBetPoints = await getBetPoints(db, contract.id, {
        limit,
        afterTime,
      })

      const points = [
        { x: contract.createdTime, y: getInitialProbability(contract) },
        ...allBetPoints,
      ]

      points.sort((a, b) => a.x - b.x)
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
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract

  const router = useRouter()

  const [showQRCode, setShowQRCode] = useState(false)

  useEffect(() => {
    if (router.query.qr !== undefined) {
      setShowQRCode(true)
    }
  }, [router.query.qr])

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
      <ContractSmolView
        contract={contract}
        points={props.points}
        showQRCode={showQRCode}
      />
    </>
  )
}

const ContractChart = (props: {
  contract: Contract
  points: Points | null
  width: number
  height: number
}) => {
  const { contract, points, ...rest } = props
  if (!points) return null

  switch (contract.outcomeType) {
    case 'BINARY':
      return (
        <BinaryContractChart {...rest} contract={contract} betPoints={points} />
      )
    case 'PSEUDO_NUMERIC':
      return (
        <PseudoNumericContractChart
          {...rest}
          contract={contract}
          betPoints={points}
        />
      )

    case 'NUMERIC':
      return <NumericContractChart {...rest} contract={contract} />
    case 'STONK':
      return (
        <StonkContractChart {...rest} betPoints={points} contract={contract} />
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
  showQRCode: boolean
}) {
  const { contract, points, showQRCode } = props
  const { question, outcomeType } = contract

  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isMulti =
    outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'FREE_RESPONSE'
  const isBountiedQuestion = outcomeType === 'BOUNTIED_QUESTION'
  const isPoll = outcomeType === 'POLL'

  const href = `https://${DOMAIN}${contractPath(contract)}`

  const shareUrl = getShareUrl(contract, undefined)

  return (
    <Col className="bg-canvas-0 h-[100vh] w-full gap-1 px-6 py-4">
      <Row className="text-ink-500 w-full justify-between text-sm">
        <Row className="items-center gap-1">
          <Avatar
            size="2xs"
            avatarUrl={contract.creatorAvatarUrl}
            username={contract.creatorUsername}
            noLink
          />
          {contract.creatorName}
        </Row>
      </Row>
      <Row className="justify-between gap-4">
        <Col>
          <a
            href={href}
            target="_blank"
            className="hover:text-primary-700 text-ink-1000 text-lg transition-all hover:underline sm:text-xl lg:mb-4 lg:text-2xl"
            rel="noreferrer"
          >
            {question}
          </a>
        </Col>
        {isBinary && (
          <BinaryResolutionOrChance
            contract={contract}
            className="!flex-col !justify-end !gap-0 !font-semibold"
            subtextClassName="text-right w-full font-normal -mt-1"
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
      <div className="grow-y relative flex h-full w-full">
        {showQRCode && (
          <div className="absolute inset-0 z-10 m-auto flex items-center justify-center">
            <div className="border-ink-400 bg-canvas-0 rounded-xl border p-4 pb-2 drop-shadow">
              <QRCode url={shareUrl} />
              <div className="mt-1 text-center text-lg">Scan to bet!</div>
            </div>
          </div>
        )}
        {!isBountiedQuestion && !isPoll && (
          <SizedContainer
            className={clsx(
              'text-ink-1000 my-4 min-h-0 flex-1',
              !isMulti && 'pr-10'
            )}
          >
            {(w, h) =>
              isMulti ? (
                <div className="flex h-full flex-col justify-center">
                  <SimpleAnswerBars
                    contract={contract}
                    maxAnswers={numBars(h)}
                  />
                </div>
              ) : (
                <ContractChart
                  contract={contract}
                  points={points}
                  width={w}
                  height={h}
                />
              )
            }
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
            <Col className="absolute bottom-0 left-0 right-0 top-12">
              <Col className="mx-auto my-auto text-center">
                <div className="text-ink-1000 text-3xl">
                  {formatMoney(contract.bountyLeft)}
                </div>
                <div className="text-ink-500">bounty</div>
              </Col>
            </Col>
          </Col>
        )}
        {isPoll && (
          <Col className="relative h-full w-full">
            <PollPanel contract={contract} maxOptions={4} showResults />
          </Col>
        )}
      </div>
      <Row className="text-ink-500 mt-4 w-full justify-end text-sm md:text-lg">
        <ContractSummaryStats contract={contract} />
      </Row>
    </Col>
  )
}
