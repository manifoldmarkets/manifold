import clsx from 'clsx'
import {
  HistoryPoint,
  MultiBase64Points,
  MultiPoints,
  unserializeBase64Multi,
} from 'common/chart'
import {
  CPMMMultiContract,
  Contract,
  contractPath,
  getMainBinaryMCAnswer,
  isBinaryMulti,
} from 'common/contract'
import { getMultiBetPoints, getSingleBetPoints } from 'common/contract-params'
import { DOMAIN, TRADE_TERM } from 'common/envs/constants'
import { getContractFromSlug } from 'common/supabase/contracts'
import { formatMoney } from 'common/util/format'
import { getShareUrl } from 'common/util/share'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { NoSEO } from 'web/components/NoSEO'
import { SimpleAnswerBars } from 'web/components/answers/answers-panel'
import {
  BinaryContractChart,
  MultiBinaryChart,
} from 'web/components/charts/contract/binary'
import { ChoiceContractChart } from 'web/components/charts/contract/choice'
import { PseudoNumericContractChart } from 'web/components/charts/contract/pseudo-numeric'
import { StonkContractChart } from 'web/components/charts/contract/stonk'
import {
  BinaryResolutionOrChance,
  MultiDateResolutionOrExpectation,
  MultiNumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
  StonkPrice,
} from 'web/components/contract/contract-price'
import { ContractSEO } from 'web/components/contract/contract-seo'
import { ContractSummaryStats } from 'web/components/contract/contract-summary-stats'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { PollPanel } from 'web/components/poll/poll-panel'
import { SizedContainer } from 'web/components/sized-container'
import { Avatar } from 'web/components/widgets/avatar'
import { QRCode } from 'web/components/widgets/qr-code'
import { useLiveContract } from 'web/hooks/use-contract'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import Custom404 from '../../404'
import { getBetPoints, getBetPointsBetween } from 'common/bets'
import { MultiNumericContractChart } from 'web/components/charts/contract/multi-numeric'
import { MultiDateContractChart } from 'web/components/charts/contract/multi-date'
import { pointsToBase64 } from 'common/util/og'
import { mapValues } from 'lodash'
import { useUser } from 'web/hooks/use-user'
type Points = HistoryPoint<any>[]

async function getHistoryData(contract: Contract) {
  switch (contract.outcomeType) {
    case 'BINARY':
    case 'PSEUDO_NUMERIC':
    case 'STONK': {
      const allBetPoints = await getBetPoints(contract.id)
      const points = getSingleBetPoints(allBetPoints, contract)
      return points.map(([x, y]) => ({ x, y }))
    }
    default:
      return null
  }
}

export async function getStaticProps(props: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = props.params
  // TODO: use admin db
  const contract = await getContractFromSlug(db, contractSlug)
  if (contract == null) {
    return { notFound: true, revalidate: 60 }
  }

  const points = await getHistoryData(contract)

  let multiPoints = null
  if (
    contract.outcomeType === 'MULTI_NUMERIC' ||
    contract.outcomeType === 'DATE'
  ) {
    const includeRedemptions =
      contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
    const allBetPoints = await getBetPointsBetween(contract, {
      filterRedemptions: !includeRedemptions,
      includeZeroShareRedemptions: includeRedemptions,
      beforeTime: (contract.lastBetTime ?? contract.createdTime) + 1,
      afterTime: contract.createdTime,
    })
    multiPoints = mapValues(getMultiBetPoints(allBetPoints, contract), (v) =>
      pointsToBase64(v)
    )
  }
  return {
    props: { contract, points, multiPoints },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractEmbedPage(props: {
  contract: Contract
  points: Points | null
  multiPoints?: MultiBase64Points | null
}) {
  const [showQRCode, setShowQRCode] = useState(false)
  const { points } = props
  const multiPoints = props.multiPoints
    ? unserializeBase64Multi(props.multiPoints)
    : null

  const contract = useLiveContract(props.contract)

  const router = useRouter()

  useEffect(() => {
    if (router.isReady) {
      if (router.query.qr !== undefined) {
        setShowQRCode(true)
      }
    }
  }, [router.isReady, router.query])

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
        points={points}
        multiPoints={multiPoints}
        showQRCode={showQRCode}
      />
    </>
  )
}

const ContractChart = (props: {
  contract: Contract
  points: Points | null
  multiPoints?: MultiPoints | null
  width: number
  height: number
}) => {
  const { contract, points, multiPoints, ...rest } = props

  if (points) {
    switch (contract.outcomeType) {
      case 'BINARY':
        return (
          <BinaryContractChart
            {...rest}
            contract={contract}
            betPoints={points}
          />
        )
      case 'PSEUDO_NUMERIC':
        return (
          <PseudoNumericContractChart
            {...rest}
            contract={contract}
            betPoints={points}
          />
        )
      case 'STONK':
        return (
          <StonkContractChart
            {...rest}
            betPoints={points}
            contract={contract}
          />
        )
      case 'MULTIPLE_CHOICE':
        return isBinaryMulti(contract) ? (
          <MultiBinaryChart
            {...rest}
            contract={contract as CPMMMultiContract}
            betPoints={points}
          />
        ) : null
    }
  }
  if (multiPoints) {
    switch (contract.outcomeType) {
      case 'MULTI_NUMERIC':
        return (
          <MultiNumericContractChart
            {...rest}
            contract={contract}
            multiPoints={multiPoints}
          />
        )
      case 'DATE':
        return (
          <MultiDateContractChart
            {...rest}
            contract={contract}
            multiPoints={multiPoints}
          />
        )
      default:
        return null
    }
  }
  return null
}

const numBars = (height: number, withChart?: boolean) => {
  if (withChart) {
    if (height < 350) return 1
    if (height < 400) return 2
    if (height < 450) return 3
    if (height < 500) return 4
    if (height < 550) return 5
    if (height < 600) return 6
    return 7
  }
  if (height < 50) return 0
  if (height < 100) return 1
  if (height < 150) return 2
  if (height < 200) return 3
  if (height < 250) return 4
  if (height < 300) return 5
  if (height < 350) return 6
  return 7
}

function ContractSmolView(props: {
  contract: Contract
  points: Points | null
  multiPoints?: MultiPoints | null
  showQRCode: boolean
}) {
  const { contract, points, multiPoints, showQRCode } = props
  const { question, outcomeType } = contract
  const isCashContract = contract.token == 'CASH'

  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isMulti = outcomeType === 'MULTIPLE_CHOICE'
  const mainBinaryMCAnswer = getMainBinaryMCAnswer(contract)
  const isBountiedQuestion = outcomeType === 'BOUNTIED_QUESTION'
  const isPoll = outcomeType === 'POLL'
  const isMultiNumeric = outcomeType === 'MULTI_NUMERIC'
  const isDate = outcomeType === 'DATE'

  const href = `https://${DOMAIN}${contractPath(contract)}`
  const user = useUser()
  const shareUrl = getShareUrl(contract, user?.username)

  const showMultiChart = isMulti && !!props.multiPoints

  return (
    <Col className="bg-canvas-0 h-[100vh] w-full gap-1 px-6 py-4">
      <Row className="text-ink-500 items-center gap-1 text-sm">
        <Avatar
          size="2xs"
          avatarUrl={contract.creatorAvatarUrl}
          username={contract.creatorUsername}
          noLink
        />
        {contract.creatorName}
      </Row>
      <Row className="justify-between gap-4">
        <a
          href={href}
          target="_blank"
          className="hover:text-primary-700 text-ink-1000 text-lg transition-all hover:underline sm:text-xl lg:mb-4 lg:text-2xl"
          rel="noreferrer"
        >
          {question}
        </a>
        {isBinary && (
          <BinaryResolutionOrChance
            contract={contract}
            className="!flex-col !justify-end !gap-0 !font-semibold"
            subtextClassName="text-right w-full font-normal -mt-1"
          />
        )}
        {isMultiNumeric && (
          <MultiNumericResolutionOrExpectation
            contract={contract}
            className="!flex-col !gap-0"
          />
        )}
        {isDate && (
          <MultiDateResolutionOrExpectation
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

        {outcomeType === 'STONK' && (
          <StonkPrice className="!flex-col !gap-0" contract={contract} />
        )}
      </Row>
      <div className="relative flex h-full min-h-0 w-full flex-1">
        {showQRCode && !showMultiChart && (
          <FloatingQRCode shareUrl={shareUrl} />
        )}
        {!isBountiedQuestion && !isPoll && (
          <SizedContainer
            className={clsx(
              'text-ink-1000 my-4 min-h-0 w-full flex-1',
              !isMulti && 'pr-10'
            )}
          >
            {(w, h) =>
              mainBinaryMCAnswer &&
              contract.mechanism === 'cpmm-multi-1' &&
              contract.outcomeType !== 'NUMBER' ? (
                <div className="flex h-full flex-col justify-center">
                  {showMultiChart && (
                    <div className="relative">
                      <ContractChart
                        contract={contract}
                        points={multiPoints![mainBinaryMCAnswer.id]}
                        width={w - 10}
                        height={h - 24}
                      />
                      <Spacer h={6} />
                      {showQRCode && <FloatingQRCode shareUrl={shareUrl} />}
                    </div>
                  )}
                </div>
              ) : isMulti ? (
                <div className="flex h-full flex-col justify-center">
                  {showMultiChart && (
                    <div className="relative">
                      <ChoiceContractChart
                        contract={contract as CPMMMultiContract}
                        multiPoints={multiPoints!}
                        width={w - 28}
                        height={h - numBars(h, showMultiChart) * 55}
                        selectedAnswerIds={contract.answers.map((a) => a.id)}
                      />
                      <Spacer h={14} />
                      {showQRCode && <FloatingQRCode shareUrl={shareUrl} />}
                    </div>
                  )}

                  <SimpleAnswerBars
                    contract={contract}
                    maxAnswers={numBars(h, showMultiChart)}
                  />
                </div>
              ) : (
                <ContractChart
                  contract={contract}
                  points={points}
                  multiPoints={multiPoints}
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
      <Row className="text-ink-500 mt-4 w-full justify-end text-sm ">
        <ContractSummaryStats
          contractId={contract.id}
          creatorId={contract.creatorId}
          question={contract.question}
          financeContract={contract}
          editable={false}
          isCashContract={isCashContract}
        />
      </Row>
    </Col>
  )
}

function FloatingQRCode(props: { shareUrl: string }) {
  const { shareUrl } = props
  return (
    <div className="absolute inset-0 z-10 m-auto flex items-center justify-center">
      <div className="border-ink-400 bg-canvas-50 rounded-xl border p-4 pb-2 drop-shadow">
        <QRCode url={shareUrl} />
        <div className="mt-1 text-center text-lg">Scan to {TRADE_TERM}!</div>
      </div>
    </div>
  )
}
