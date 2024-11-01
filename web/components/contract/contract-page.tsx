import { StarIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import {
  type Contract,
  type ContractParams,
  tradingAllowed,
} from 'common/contract'
import { mergeWith, uniqBy } from 'lodash'
import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import {
  HistoryPoint,
  MultiBase64Points,
  MultiPoints,
  unserializeBase64Multi,
} from 'common/chart'
import { base64toPoints } from 'common/edge/og'
import { HOUSE_BOT_USERNAME, SPICE_MARKET_TOOLTIP } from 'common/envs/constants'
import { DAY_MS } from 'common/util/time'
import { UserBetsSummary } from 'web/components/bet/bet-summary'
import { ScrollToTopButton } from 'web/components/buttons/scroll-to-top-button'
import { SidebarSignUpButton } from 'web/components/buttons/sign-up-button'
import { getMultiBetPoints } from 'web/components/charts/contract/choice'
import { BackButton } from 'web/components/contract/back-button'
import { ChangeBannerButton } from 'web/components/contract/change-banner-button'
import { ContractDescription } from 'web/components/contract/contract-description'
import { AuthorInfo } from 'web/components/contract/contract-details'
import { ContractLeaderboard } from 'web/components/contract/contract-leaderboard'
import {
  ContractOverview,
  getShouldHideGraph,
} from 'web/components/contract/contract-overview'
import ContractSharePanel from 'web/components/contract/contract-share-panel'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { DangerZone } from 'web/components/contract/danger-zone'
import { EditableQuestionTitle } from 'web/components/contract/editable-question-title'
import { MarketTopics } from 'web/components/contract/market-topics'
import {
  RelatedContractsGrid,
  SidebarRelatedContractsList,
} from 'web/components/contract/related-contracts-widget'
import { ContractSummaryStats } from 'web/components/contract/contract-summary-stats'
import { HeaderActions } from 'web/components/contract/header-actions'
import { ExplainerPanel } from 'web/components/explainer-panel'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { Rating, ReviewPanel } from 'web/components/reviews/stars'
import { GradientContainer } from 'web/components/widgets/gradient-container'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { useContractBets } from 'web/hooks/use-bets'
import { useLiveContractWithAnswers } from 'web/hooks/use-contract'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { useRelatedMarkets } from 'web/hooks/use-related-contracts'
import { useReview } from 'web/hooks/use-review'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'
import {
  useSavedContractMetrics,
  useTopContractMetrics,
} from 'web/hooks/use-saved-contract-metrics'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { YourTrades } from 'web/pages/[username]/[contractSlug]'
import { useSweepstakes } from '../sweepstakes-provider'
import { useRouter } from 'next/router'

export function ContractPageContent(props: ContractParams) {
  const {
    comments,
    relatedContracts,
    pointsString,
    multiPointsString,
    chartAnnotations,
    topics,
    dashboards,
    pinnedComments,
    betReplies,
    cash,
  } = props

  // sync query state with context
  const { prefersPlay } = useSweepstakes()
  const router = useRouter()
  const livePlayContract = useLiveContractWithAnswers(props.contract)
  const sweepsIsPossible = !!livePlayContract.siblingContractId
  const [isPlay, setIsPlay] = useState<boolean | undefined>(prefersPlay)
  const liveCashContract = props.cash
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useLiveContractWithAnswers(props.cash.contract)
    : null

  const liveContract =
    !isPlay && liveCashContract ? liveCashContract : livePlayContract
  const user = useUser()

  // Read and set play state from the query if the user hasn't set their preference
  useEffect(() => {
    if (
      isPlay !== undefined || // user has set their preference
      prefersPlay !== undefined || // user has set their preference
      !router.isReady // not ready yet
    )
      return
    const playQuery = router.query.play
    const queryIndicatesSweeps = playQuery === 'false'
    const queryIndicatesPlay =
      playQuery === 'true' ||
      (playQuery === undefined &&
        !sweepsIsPossible &&
        prefersPlay === undefined)

    if (queryIndicatesSweeps) {
      if (sweepsIsPossible && isPlay) {
        setIsPlay(false)
      } else if (!sweepsIsPossible && !isPlay) {
        setIsPlay(true)
      }
    } else if (queryIndicatesPlay && !isPlay) {
      setIsPlay(true)
    }
  }, [isPlay, router.query, prefersPlay])

  // When the user changes their preference, update the play state and set the query
  useEffect(() => {
    if (prefersPlay === undefined) return
    const shouldBePlay =
      (prefersPlay && !isPlay) || (!sweepsIsPossible && !isPlay)
    const shouldBeSweeps =
      !prefersPlay &&
      (isPlay === undefined || isPlay === true) &&
      sweepsIsPossible
    if (shouldBePlay) {
      setIsPlay(true)
      setPlayStateInQuery(true)
    } else if (shouldBeSweeps) {
      setIsPlay(false)
      setPlayStateInQuery(false)
    }
  }, [prefersPlay])

  const setPlayStateInQuery = (play: boolean) => {
    const newQuery = { ...router.query, play: play.toString() }

    if (JSON.stringify(newQuery) !== JSON.stringify(router.query)) {
      router.replace(
        {
          query: newQuery,
          hash: router.asPath.split('#')[1],
        },
        undefined,
        { shallow: true }
      )
    }
  }

  const myContractMetrics = useSavedContractMetrics(liveContract)
  const topContractMetrics = useTopContractMetrics({
    playContract: livePlayContract,
    cashContract: liveCashContract,
    prefersPlay: isPlay ?? false,
    // TODO: do we really need this? leaderboards are below the fold. If we do, should add for cash as well
    defaultTopManaTraders: props.topContractMetrics,
    defaultTopCashTraders: [],
  })

  const privateUser = usePrivateUser()
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  useSaveCampaign()
  useTracking(
    'view market',
    {
      slug: props.contract.slug,
      contractId: props.contract.id,
      creatorId: props.contract.creatorId,
    },
    true,
    [user?.id] // track user view market event if they sign up/sign in on this page
  )
  useSaveContractVisitsLocally(user === null, props.contract.id)

  const playBetData = useBetData({
    contractId: props.contract.id,
    outcomeType: props.contract.outcomeType,
    userId: user?.id,
    lastBetTime: props.lastBetTime,
    totalBets: props.totalBets,
    pointsString,
    multiPointsString,
  })

  const cashBetData = useBetData({
    contractId: cash?.contract.id ?? '_',
    outcomeType: cash?.contract.outcomeType,
    userId: user?.id,
    lastBetTime: cash?.lastBetTime,
    totalBets: cash?.totalBets ?? 0,
    pointsString: cash?.pointsString,
    multiPointsString: cash?.multiPointsString,
  })

  const { bets, totalBets, yourNewBets, betPoints } =
    cash && !isPlay ? cashBetData : playBetData

  const { isResolved, outcomeType, resolution, closeTime, creatorId } =
    liveContract
  const { coverImageUrl } = livePlayContract

  const description = livePlayContract.description

  const isAdmin = useAdmin()
  const isMod = useTrusted()
  const isCreator = creatorId === user?.id
  const isClosed = !!(closeTime && closeTime < Date.now())
  const [showResolver, setShowResolver] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [imageError, setImageError] = useState(false)

  const [replyTo, setReplyTo] = useState<Answer | Bet>()

  const tabsContainerRef = useRef<null | HTMLDivElement>(null)
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)

  const initialHideGraph = getShouldHideGraph(liveContract)
  const [hideGraph, setHideGraph] = useState(initialHideGraph)

  useEffect(() => {
    if (replyTo) {
      setActiveTabIndex(0)
      if (tabsContainerRef.current) {
        scrollIntoViewCentered(tabsContainerRef.current)
      } else {
        console.error('no ref to scroll to')
      }
    }
  }, [replyTo])

  const { contracts: relatedMarkets, loadMore } = useRelatedMarkets(
    props.contract,
    relatedContracts
  )

  // detect whether header is stuck by observing if title is visible
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  const showExplainerPanel =
    user === null || (user && user.createdTime > Date.now() - 3 * DAY_MS)

  const [justNowReview, setJustNowReview] = useState<null | Rating>(null)
  const userReview = useReview(props.contract.id, user?.id)
  const userHasReviewed = userReview || justNowReview

  const isSpiceMarket = !!liveContract.isSpicePayout
  const isCashContract = liveContract.token === 'CASH'

  return (
    <>
      {props.contract.visibility !== 'public' && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}

      <Row className="w-full items-start justify-center gap-8">
        <Col
          className={clsx(
            'bg-canvas-0 w-full max-w-3xl rounded-b xl:w-[70%]',
            // Keep content in view when scrolling related questions on desktop.
            'sticky bottom-0 min-h-screen self-end',
            // Accommodate scroll to top button at bottom of page.
            'pb-10 xl:pb-0'
          )}
        >
          <div
            className={clsx(
              'sticky z-50 flex items-end',
              !coverImageUrl
                ? 'bg-canvas-0 top-0 w-full'
                : 'top-[-92px] h-[140px]'
            )}
          >
            {coverImageUrl && !imageError && (
              <div className="absolute -top-10 bottom-0 left-0 right-0 -z-10">
                <Image
                  fill
                  alt=""
                  sizes="100vw"
                  className="object-cover"
                  src={coverImageUrl}
                  onError={() => {
                    track('image error on contract', {
                      contractId: props.contract.id,
                      imageUrl: coverImageUrl,
                    })
                    setImageError(true)
                  }}
                  priority
                />
                <ChangeBannerButton
                  contract={livePlayContract}
                  className="absolute right-4 top-12"
                />
              </div>
            )}

            <Row
              className={clsx(
                'sticky -top-px z-50 h-12 w-full transition-colors',
                headerStuck
                  ? 'dark:bg-canvas-50/80 bg-white/80 backdrop-blur-sm'
                  : ''
              )}
            >
              <Row className="mr-4 grow items-center">
                {(headerStuck || !coverImageUrl) && (
                  <BackButton className="self-stretch pr-8" />
                )}
                {headerStuck && (
                  <span
                    className="text-ink-1000 line-clamp-2 cursor-pointer select-none first:ml-4"
                    onClick={() =>
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  >
                    {isSpiceMarket && (
                      <Tooltip text={SPICE_MARKET_TOOLTIP}>
                        <SpiceCoin />
                      </Tooltip>
                    )}
                    <VisibilityIcon contract={props.contract} />{' '}
                    {props.contract.question}
                  </span>
                )}
              </Row>
              {(headerStuck || !coverImageUrl) && (
                <HeaderActions
                  playContract={livePlayContract}
                  currentContract={liveContract}
                  initialHideGraph={initialHideGraph}
                  hideGraph={hideGraph}
                  setHideGraph={setHideGraph}
                />
              )}
            </Row>
          </div>
          {coverImageUrl && (
            <Row className="h-10 w-full justify-between">
              {/* Wrap in div so that justify-between works when BackButton is null. */}
              <div>
                <BackButton className="pr-8" />
              </div>
              <HeaderActions
                playContract={livePlayContract}
                currentContract={liveContract}
                initialHideGraph={initialHideGraph}
                hideGraph={hideGraph}
                setHideGraph={setHideGraph}
              />
            </Row>
          )}

          <Col className={clsx('mb-4 p-4 pt-0 md:pb-8 lg:px-8')}>
            <Col className="w-full gap-3 lg:gap-4">
              <Col>
                <div ref={titleRef}>
                  <VisibilityIcon
                    contract={props.contract}
                    isLarge
                    className="mr-1"
                  />
                  <EditableQuestionTitle
                    contract={livePlayContract}
                    canEdit={isAdmin || isCreator || isMod}
                  />
                </div>
              </Col>
              <Row className="text-ink-600 flex-wrap items-center justify-between gap-y-1 text-sm">
                <AuthorInfo
                  contract={props.contract}
                  resolverId={liveContract.resolverId}
                />
                <ContractSummaryStats
                  contractId={props.contract.id}
                  creatorId={props.contract.creatorId}
                  question={props.contract.question}
                  financeContract={liveContract}
                  editable={isCreator || isAdmin || isMod}
                  isCashContract={isCashContract}
                />
              </Row>
              <ContractOverview
                contract={liveContract}
                key={liveContract.id} // reset state when switching play vs cash
                betPoints={betPoints}
                showResolver={showResolver}
                resolutionRating={
                  userHasReviewed ? (
                    <Row className="text-ink-500 items-center gap-0.5 text-sm italic">
                      You rated this resolution{' '}
                      {justNowReview ?? userReview?.rating}{' '}
                      <StarIcon className="h-4 w-4" />
                    </Row>
                  ) : null
                }
                setShowResolver={setShowResolver}
                onAnswerCommentClick={setReplyTo}
                chartAnnotations={chartAnnotations}
                hideGraph={hideGraph}
                setHideGraph={setHideGraph}
              />
              {!tradingAllowed(liveContract) && (
                <UserBetsSummary
                  className="border-ink-200 !mb-2 "
                  contract={liveContract}
                />
              )}
              <YourTrades contract={liveContract} yourNewBets={yourNewBets} />
            </Col>
            {showReview && user && (
              <div className="relative my-2">
                <ReviewPanel
                  marketId={props.contract.id}
                  author={props.contract.creatorName}
                  onSubmit={(rating: Rating) => {
                    setJustNowReview(rating)
                    setShowReview(false)
                  }}
                />
                <button
                  className="text-ink-400 hover:text-ink-600 absolute right-0 top-0 p-4"
                  onClick={() => setShowReview(false)}
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            )}
            {showResolver &&
              user &&
              (outcomeType === 'PSEUDO_NUMERIC' ? (
                <GradientContainer className="my-2">
                  <NumericResolutionPanel
                    contract={liveContract}
                    onClose={() => setShowResolver(false)}
                  />
                </GradientContainer>
              ) : outcomeType === 'BINARY' ? (
                <GradientContainer className="my-2">
                  <ResolutionPanel
                    contract={liveContract}
                    onClose={() => setShowResolver(false)}
                  />
                </GradientContainer>
              ) : null)}

            <DangerZone
              contract={liveContract}
              showResolver={showResolver}
              setShowResolver={setShowResolver}
              showReview={showReview}
              setShowReview={setShowReview}
              userHasBet={!!myContractMetrics}
              hasReviewed={!!userHasReviewed}
            />
            <ContractDescription
              contract={liveContract}
              description={description}
            />
            <Row className="items-center gap-2">
              <MarketTopics
                contract={props.contract}
                dashboards={dashboards}
                topics={topics}
                isSpiceMarket={isSpiceMarket}
              />
            </Row>

            <Row className="my-2 flex-wrap items-center justify-between gap-y-2"></Row>
            {!user && <SidebarSignUpButton className="mb-4 flex md:hidden" />}
            {!!user && (
              <ContractSharePanel
                isClosed={isClosed}
                isCreator={isCreator}
                showResolver={showResolver}
                // TODO: upgrade tier
                contract={props.contract}
              />
            )}

            {isResolved && resolution !== 'CANCEL' && (
              <>
                <ContractLeaderboard
                  topContractMetrics={topContractMetrics.filter(
                    (metric) => metric.userUsername !== HOUSE_BOT_USERNAME
                  )}
                  contractId={liveContract.id}
                  currentUser={user}
                  currentUserMetrics={myContractMetrics}
                  isCashContract={isCashContract}
                />
                <Spacer h={12} />
              </>
            )}

            <div ref={tabsContainerRef} className="mb-4">
              <ContractTabs
                mainContract={props.contract}
                liveContract={liveContract}
                bets={bets}
                totalBets={totalBets}
                comments={comments}
                userPositionsByOutcome={
                  !isPlay && cash
                    ? cash.userPositionsByOutcome
                    : props.userPositionsByOutcome
                }
                totalPositions={
                  !isPlay && cash ? cash.totalPositions : props.totalPositions
                }
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                blockedUserIds={blockedUserIds}
                activeIndex={activeTabIndex}
                setActiveIndex={setActiveTabIndex}
                pinnedComments={pinnedComments}
                // TODO: cash-bet replies???
                betReplies={betReplies}
              />
            </div>
            {showExplainerPanel && (
              <div className="bg-canvas-50 -mx-4 p-4 pb-0 md:-mx-8 xl:hidden">
                <h2 className={clsx('text-ink-600  text-xl')}>What is this?</h2>
                <ExplainerPanel />
              </div>
            )}
            <RelatedContractsGrid
              contracts={relatedMarkets}
              loadMore={loadMore}
              showAll={true}
            />
          </Col>
        </Col>
        <Col className="hidden min-h-full max-w-[375px] xl:flex">
          {showExplainerPanel && (
            <div>
              <h2 className={clsx('text-ink-600  text-xl')}>What is this?</h2>
              <ExplainerPanel />
            </div>
          )}

          <SidebarRelatedContractsList
            contracts={relatedMarkets}
            loadMore={loadMore}
            topics={topics}
          />
        </Col>
      </Row>

      <ScrollToTopButton className="fixed bottom-16 right-2 z-20 lg:bottom-2 xl:hidden" />
    </>
  )
}

const useBetData = (props: {
  contractId: string
  outcomeType: Contract['outcomeType'] | undefined
  userId: string | undefined
  lastBetTime: number | undefined
  totalBets: number
  pointsString: string | undefined
  multiPointsString: MultiBase64Points | undefined
}) => {
  const {
    contractId,
    userId,
    outcomeType,
    lastBetTime,
    pointsString,
    multiPointsString,
  } = props

  const isNumber = outcomeType === 'NUMBER'

  const newBets = useContractBets(contractId, {
    afterTime: lastBetTime ?? 0,
    includeZeroShareRedemptions: true,
    filterRedemptions: !isNumber,
  })

  const newBetsWithoutRedemptions = newBets.filter((bet) => !bet.isRedemption)
  const totalBets =
    props.totalBets +
    (isNumber
      ? uniqBy(newBetsWithoutRedemptions, 'betGroupId').length
      : newBetsWithoutRedemptions.length)
  const bets = useMemo(
    () => uniqBy(isNumber ? newBets : newBetsWithoutRedemptions, 'id'),
    [newBets.length]
  )
  const yourNewBets = newBets.filter((bet) => userId && bet.userId === userId)

  const betPoints = useMemo(() => {
    if (outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'NUMBER') {
      const data = multiPointsString
        ? unserializeBase64Multi(multiPointsString)
        : {}
      const newData = getMultiBetPoints(newBets)

      return mergeWith(data, newData, (array1, array2) =>
        [...(array1 ?? []), ...(array2 ?? [])].sort((a, b) => a.x - b.x)
      ) as MultiPoints
    } else {
      const points = pointsString ? base64toPoints(pointsString) : []
      const newPoints = newBetsWithoutRedemptions.map((bet) => ({
        x: bet.createdTime,
        y: bet.probAfter,
      }))
      return [...points, ...newPoints] as HistoryPoint<Partial<Bet>>[]
    }
  }, [pointsString, newBets.length])

  return {
    bets,
    totalBets,
    yourNewBets,
    betPoints,
  }
}
