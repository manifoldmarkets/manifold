import clsx from 'clsx'
import { getBetPoints, getBetPointsBetween } from 'common/bets'
import {
  HistoryPoint,
  MultiBase64Points,
  MultiPoints,
  unserializeBase64Multi,
} from 'common/chart'
import {
  CPMMMultiContract,
  Contract,
  PerpContract,
  contractPath,
  getMainBinaryMCAnswer,
  isBinaryMulti,
} from 'common/contract'
import { getMultiBetPoints, getSingleBetPoints } from 'common/contract-params'
import {
  DOMAIN,
  PERPS_SKIP_ORACLE_FRESHNESS,
  TRADE_TERM,
} from 'common/envs/constants'
import { getPerpEmbedSummary } from 'common/perps/embed'
import { fundingPeriodUnit } from 'common/perps/funding'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { getContractFromSlug } from 'common/supabase/contracts'
import { formatMoney } from 'common/util/format'
import { pointsToBase64 } from 'common/util/og'
import { getShareUrl } from 'common/util/share'
import { mapValues } from 'lodash'
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
import { MultiDateContractChart } from 'web/components/charts/contract/multi-date'
import { MultiNumericContractChart } from 'web/components/charts/contract/multi-numeric'
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
import { FeedPerpPriceSparkline } from 'web/components/perps/feed-perp-price-sparkline'
import { PerpMarketBadge } from 'web/components/perps/perp-market-badge'
import { PerpOracleAttribution } from 'web/components/perps/perp-oracle-attribution'
import { useLivePerpContract } from 'web/components/perps/use-live-perp-contract'
import { PollPanel } from 'web/components/poll/poll-panel'
import { SizedContainer } from 'web/components/sized-container'
import { Avatar } from 'web/components/widgets/avatar'
import { QRCode } from 'web/components/widgets/qr-code'
import { useLiveContract } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import Custom404 from '../../404'
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

  let contract
  try {
    // TODO: use admin db
    contract = await getContractFromSlug(db, contractSlug)
  } catch (error) {
    console.error('DB error fetching contract:', contractSlug, error)
    return { notFound: true, revalidate: 60 }
  }

  if (contract == null) {
    return { notFound: true }
  }

  let points
  let multiPoints = null
  try {
    points = await getHistoryData(contract)

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
  } catch (error) {
    console.error('DB error fetching contract data:', contractSlug, error)
    return { notFound: true, revalidate: 60 }
  }

  return {
    props: { contract, points, multiPoints },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

type ContractEmbedPageProps = {
  contract: Contract
  points: Points | null
  multiPoints?: MultiBase64Points | null
}

export default function ContractEmbedPage(props: ContractEmbedPageProps) {
  const subscribedContract = useLiveContract(props.contract)

  if (!subscribedContract) return <Custom404 />

  return subscribedContract.outcomeType === 'PERP' ? (
    <LivePerpContractEmbedPage {...props} contract={subscribedContract} />
  ) : (
    <ContractEmbedView {...props} contract={subscribedContract} />
  )
}

function LivePerpContractEmbedPage(
  props: Omit<ContractEmbedPageProps, 'contract'> & {
    contract: PerpContract
  }
) {
  const { contract } = useLivePerpContract(props.contract)
  return <ContractEmbedView {...props} contract={contract} />
}

function ContractEmbedView(props: ContractEmbedPageProps) {
  const [showQRCode, setShowQRCode] = useState(false)
  const { points } = props
  const multiPoints = props.multiPoints
    ? unserializeBase64Multi(props.multiPoints)
    : null

  const { contract } = props

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

  if (contract.outcomeType === 'PERP') {
    return (
      <PerpContractSmolView
        contract={contract}
        href={href}
        shareUrl={shareUrl}
        showQRCode={showQRCode}
      />
    )
  }

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

function PerpContractSmolView(props: {
  contract: PerpContract
  href: string
  shareUrl: string
  showQRCode: boolean
}) {
  const { contract, href, shareUrl, showQRCode } = props
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const interval = setInterval(update, 15_000)
    return () => clearInterval(interval)
  }, [contract.maxOraclePriceAgeMs, contract.oraclePriceTime])

  const summary = getPerpEmbedSummary(
    contract,
    now ?? Number.NaN,
    PERPS_SKIP_ORACLE_FRESHNESS
  )
  const priceDecimals = inferPriceDecimals([summary.displayPrice])
  const isCheckingOracle =
    now == null && summary.status === 'unavailable' && !contract.isResolved
  const statusLabel = isCheckingOracle
    ? 'Checking oracle'
    : summary.status === 'live'
    ? 'Live · trading open'
    : summary.status === 'stale'
    ? 'Oracle delayed · trading paused'
    : summary.status === 'unavailable'
    ? 'Oracle unavailable · trading paused'
    : summary.status === 'cancelled'
    ? 'Cancelled'
    : 'Settled'
  const ctaLabel =
    summary.status === 'settled'
      ? 'View settled market'
      : summary.status === 'cancelled'
      ? 'View cancelled market'
      : summary.canTrade
      ? 'Trade long or short'
      : 'View market'
  const funding = summary.funding
  const fundingPercent = funding ? funding.rate * 100 : null
  const fundingDirection =
    funding?.payer == null ? 'balanced' : `${funding.payer} pay`

  return (
    <Col className="bg-canvas-0 relative h-[100vh] w-full overflow-hidden px-4 py-3">
      {showQRCode && <FloatingQRCode shareUrl={shareUrl} />}
      <Row className="text-ink-500 min-h-5 items-center justify-between gap-2 text-xs">
        <Row className="min-w-0 items-center gap-1">
          <Avatar
            size="2xs"
            avatarUrl={contract.creatorAvatarUrl}
            username={contract.creatorUsername}
            noLink
          />
          <span className="truncate">{contract.creatorName}</span>
        </Row>
        <span
          className={clsx(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
            summary.status === 'live'
              ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
              : summary.status === 'stale' || summary.status === 'unavailable'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
              : 'bg-canvas-100 text-ink-600'
          )}
        >
          {statusLabel}
        </span>
      </Row>

      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="hover:text-primary-700 mt-1 flex min-w-0 items-start gap-2 text-lg font-semibold leading-tight transition-colors"
      >
        <PerpMarketBadge className="mt-0.5" />
        <span className="line-clamp-2">{contract.question}</span>
      </a>

      <Row className="mt-1 flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <Col className="gap-0">
          <span className="text-ink-500 text-[11px]">{summary.priceLabel}</span>
          <span className="text-ink-1000 text-2xl font-semibold tabular-nums">
            {formatPrice(summary.displayPrice, priceDecimals)}
          </span>
        </Col>
        <Col className="text-ink-500 items-end gap-0 text-right text-[11px]">
          {summary.status === 'settled' ? (
            <>
              <span>All positions closed at the final oracle price</span>
              <span>Trading and funding have ended</span>
            </>
          ) : summary.status === 'cancelled' ? (
            <span>Trading has ended</span>
          ) : (
            <>
              <span>
                Long if it rises · Short if it falls
                {summary.maxLeverage != null
                  ? ` · up to ${summary.maxLeverage}×`
                  : ''}
              </span>
              <span>
                {formatMoney(summary.backingPool)} backing
                {funding && fundingPercent != null
                  ? ` · Funding ${
                      fundingPercent > 0 ? '+' : ''
                    }${fundingPercent.toFixed(3)}%/${fundingPeriodUnit(
                      funding.periodMs
                    )} · ${fundingDirection}`
                  : ''}
              </span>
            </>
          )}
        </Col>
      </Row>

      <FeedPerpPriceSparkline
        contract={contract}
        height={104}
        className="mt-1 min-h-0 w-full flex-1 justify-center"
        showSummary
        loadingState={
          <div className="text-ink-400 flex min-h-[64px] flex-1 items-center justify-center text-center text-xs">
            Loading 7D oracle history…
          </div>
        }
        emptyState={
          <div className="text-ink-400 flex min-h-[64px] flex-1 items-center justify-center text-center text-xs">
            Price history will appear as the oracle feed updates.
          </div>
        }
      />

      <Row className="mt-1 w-full items-end justify-between gap-3">
        <PerpOracleAttribution
          feedId={contract.oracleFeedId}
          asOfTime={contract.oracleSourceTime}
          className="line-clamp-2 min-w-0 flex-1 leading-tight"
        />
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={clsx(
            'shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            summary.canTrade
              ? 'bg-primary-600 hover:bg-primary-700 text-white'
              : 'border-ink-300 text-ink-700 hover:bg-canvas-100 border'
          )}
        >
          {ctaLabel} →
        </a>
      </Row>

      <Row className="text-ink-500 mt-auto w-full justify-end text-xs">
        <ContractSummaryStats
          contractId={contract.id}
          creatorId={contract.creatorId}
          question={contract.question}
          financeContract={contract}
          editable={false}
          isCashContract={false}
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
