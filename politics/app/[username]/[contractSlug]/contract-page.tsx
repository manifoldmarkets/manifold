'use client'
import { StarIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import {
  MultiSerializedPoints,
  unserializeMultiPoints,
  unserializePoints,
} from 'common/chart'
import { ContractParams } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { HOUSE_BOT_USERNAME } from 'common/envs/constants'
import { getTopContractMetrics } from 'common/supabase/contract-metrics'
import { first, mergeWith } from 'lodash'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollToTopButton } from 'web/components/buttons/scroll-to-top-button'
import { SidebarSignUpButton } from 'web/components/buttons/sign-up-button'
import { getMultiBetPoints } from 'web/components/charts/contract/choice'
import { BackButton } from 'web/components/contract/back-button'
import { ChangeBannerButton } from 'web/components/contract/change-banner-button'
import { ContractLeaderboard } from 'web/components/contract/contract-leaderboard'
import { ContractOverview } from 'web/components/contract/contract-overview'
import ContractSharePanel from 'web/components/contract/contract-share-panel'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { HeaderActions } from 'web/components/contract/header-actions'
import {
  RelatedContractsGrid,
  RelatedContractsList,
} from 'web/components/contract/related-contracts-widget'
import { EditableQuestionTitle } from 'web/components/contract/title-edit'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { Rating, ReviewPanel } from 'web/components/reviews/stars'
import { GradientContainer } from 'web/components/widgets/gradient-container'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { useReview } from 'web/hooks/use-review'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'

import { Bet } from 'common/bet'

import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { DangerZone } from 'web/components/contract/danger-zone'
import { ContractDescription } from 'web/components/contract/contract-description'
import { ContractSummaryStats } from 'web/components/contract/contract-summary-stats'
import { PoliticsPage } from 'politics/components/politics-page'
import ContractEmbedPage from 'web/pages/embed/[username]/[contractSlug]'
import { useRelatedPoliticalMarkets } from 'politics/hooks/use-related-politics-markets'
import { PoliticsExplainerPanel } from 'politics/components/politics-explainer-panel'

export function ContractPage(props: { contractParams: ContractParams }) {
  const inIframe = useIsIframe()

  const { contract, historyData } = props.contractParams

  const points =
    contract.outcomeType !== 'MULTIPLE_CHOICE'
      ? unserializePoints(historyData.points as any)
      : []
  if (inIframe) {
    return <ContractEmbedPage contract={contract} points={points} />
  } else
    return (
      <PoliticsPage trackPageView={false} className={'xl:col-span-10'}>
        <ContractPageContent key={contract.id} {...props.contractParams} />
      </PoliticsPage>
    )
}

export function ContractPageContent(props: ContractParams) {
  const {
    userPositionsByOutcome,
    comments,
    totalPositions,
    relatedContracts,
    historyData,
    chartAnnotations,
  } = props

  const contract =
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract
  if (contract.mechanism === 'cpmm-multi-1') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const answers = useAnswersCpmm(contract.id)
    if (answers) {
      contract.answers = answers
    }
  }

  const cachedContract = useMemo(
    () => contract,
    [
      contract.id,
      contract.resolution,
      contract.closeTime,
      'answers' in contract ? contract.answers : undefined,
    ]
  )

  const user = useUser()
  const contractMetrics = useSavedContractMetrics(contract)
  const privateUser = usePrivateUser()
  const blockedUserIds = privateUser?.blockedUserIds ?? []
  const [topContractMetrics, setTopContractMetrics] = useState<
    ContractMetric[]
  >(props.topContractMetrics)

  useEffect(() => {
    // If the contract resolves while the user is on the page, get the top contract metrics
    if (contract.resolution && topContractMetrics.length === 0) {
      getTopContractMetrics(contract.id, 10, db).then(setTopContractMetrics)
    }
  }, [contract.resolution, contract.id, topContractMetrics.length])

  useSaveCampaign()
  useTracking(
    'view politics market',
    {
      slug: contract.slug,
      contractId: contract.id,
      creatorId: contract.creatorId,
    },
    true
  )
  useSaveContractVisitsLocally(user === null, contract.id)

  // Static props load bets in descending order by time
  const lastBetTime = first(historyData.bets)?.createdTime

  const { rows, loadNewer } = useRealtimeBets({
    contractId: contract.id,
    afterTime: lastBetTime,
    filterRedemptions: contract.outcomeType !== 'MULTIPLE_CHOICE',
    order: 'asc',
  })

  useEffect(() => {
    loadNewer()
  }, [contract.volume])

  const newBets = rows ?? []
  const newBetsWithoutRedemptions = newBets.filter((bet) => !bet.isRedemption)
  const totalBets = props.totalBets + newBetsWithoutRedemptions.length
  const bets = useMemo(
    () => [...historyData.bets, ...newBetsWithoutRedemptions],
    [historyData.bets, newBets]
  )

  const betPoints = useMemo(() => {
    if (
      contract.outcomeType === 'MULTIPLE_CHOICE' ||
      contract.outcomeType === 'FREE_RESPONSE'
    ) {
      const data = unserializeMultiPoints(
        historyData.points as MultiSerializedPoints
      )
      const newData =
        contract.mechanism === 'cpmm-multi-1' ? getMultiBetPoints(newBets) : []

      return mergeWith(data, newData, (a, b) => [...(a ?? []), ...(b ?? [])])
    } else {
      const points = unserializePoints(historyData.points as any)
      const newPoints = newBets.map((bet) => ({
        x: bet.createdTime,
        y: bet.probAfter,
        obj: { userAvatarUrl: bet.userAvatarUrl },
      }))
      return [...points, ...newPoints]
    }
  }, [historyData.points, newBets])

  const {
    isResolved,
    outcomeType,
    isPolitics,
    resolution,
    closeTime,
    creatorId,
  } = contract

  const isAdmin = useAdmin()
  const isMod = useTrusted()
  const isCreator = creatorId === user?.id
  const isClosed = !!(closeTime && closeTime < Date.now())
  const [showResolver, setShowResolver] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [coverImageUrl, setCoverImageUrl] = useState(contract.coverImageUrl)
  // unhide on upload
  useEffect(() => {
    setCoverImageUrl(contract.coverImageUrl)
  }, [contract.coverImageUrl])

  useSaveReferral(user, {
    defaultReferrerUsername: contract.creatorUsername,
    contractId: contract.id,
  })

  const [replyTo, setReplyTo] = useState<Answer | DpmAnswer | Bet>()

  const tabsContainerRef = useRef<null | HTMLDivElement>(null)
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)

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

  const { contracts: relatedMarkets, loadMore } = useRelatedPoliticalMarkets(
    contract,
    relatedContracts
  )

  // detect whether header is stuck by observing if title is visible
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  const showExplainerPanel =
    user === null ||
    (user && user.createdTime > Date.now() - 24 * 60 * 60 * 1000)

  const [justNowReview, setJustNowReview] = useState<null | Rating>(null)
  const userReview = useReview(contract.id, user?.id)
  const userHasReviewed = userReview || justNowReview

  return (
    <>
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
                : ' top-[-92px] h-[140px]'
            )}
          >
            {coverImageUrl && (
              <div className="absolute -top-10 bottom-0 left-0 right-0 -z-10">
                <Image
                  fill
                  alt=""
                  sizes="100vw"
                  className="object-cover"
                  src={coverImageUrl}
                  onError={() => {
                    track('image error on contract', {
                      contractId: contract.id,
                      imageUrl: coverImageUrl,
                    })
                    setCoverImageUrl(undefined)
                  }}
                  priority
                />
                <ChangeBannerButton
                  contract={contract}
                  className="absolute right-4 top-12"
                />
              </div>
            )}
            <Row
              className={clsx(
                'sticky -top-px z-50 mt-px flex h-12 w-full px-4 py-2 transition-colors',
                headerStuck
                  ? 'dark:bg-canvas-50/80 bg-white/80 backdrop-blur-sm'
                  : ''
              )}
            >
              <Row className=" mr-4 grow">
                {(headerStuck || !coverImageUrl) && (
                  <Col className="my-auto">
                    <BackButton />
                  </Col>
                )}
                {headerStuck && (
                  <span className="text-ink-1000 ml-4 mt-1 w-full min-w-0 overflow-hidden break-all">
                    <VisibilityIcon contract={contract} /> {contract.question}
                  </span>
                )}
              </Row>

              {(headerStuck || !coverImageUrl) && (
                <HeaderActions contract={contract}>
                  {!coverImageUrl && isCreator && (
                    <ChangeBannerButton
                      contract={contract}
                      className="ml-3 first:ml-0"
                    />
                  )}
                </HeaderActions>
              )}
            </Row>
          </div>
          <Col
            className={clsx(
              'mb-4 p-4 pt-0 md:pb-8 lg:px-8',
              coverImageUrl ? 'pt-2' : ''
            )}
          >
            <Col className="w-full gap-3 lg:gap-4">
              <Col>
                {coverImageUrl && (
                  <Row className="w-full justify-between">
                    <Col className=" my-auto -ml-3">
                      <BackButton className={'!px-3'} />
                    </Col>
                    <HeaderActions contract={contract}>
                      {!coverImageUrl && isCreator && (
                        <ChangeBannerButton
                          contract={contract}
                          className="ml-3 first:ml-0"
                        />
                      )}
                    </HeaderActions>
                  </Row>
                )}
                {!isPolitics && (
                  <Row className={'bg-amber-200'}>
                    [UNOFFICIAL - MANIFOLD.MARKETS]
                  </Row>
                )}
                <div ref={titleRef}>
                  <VisibilityIcon
                    contract={contract}
                    isLarge
                    className="mr-1"
                  />
                  <EditableQuestionTitle
                    contract={contract}
                    canEdit={isAdmin || isCreator}
                  />
                </div>
              </Col>

              <div className="text-ink-600 flex flex-wrap items-center justify-between gap-y-1 text-sm">
                <ContractSummaryStats
                  contract={contract}
                  editable={isCreator || isAdmin || isMod}
                />
              </div>
              <ContractOverview
                contract={contract}
                betPoints={betPoints as any}
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
              />
            </Col>
            {showReview && user && (
              <div className="relative my-2">
                <ReviewPanel
                  marketId={contract.id}
                  author={contract.creatorName}
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
                    contract={contract}
                    onClose={() => setShowResolver(false)}
                  />
                </GradientContainer>
              ) : outcomeType === 'BINARY' ? (
                <GradientContainer className="my-2">
                  <ResolutionPanel
                    contract={contract}
                    onClose={() => setShowResolver(false)}
                  />
                </GradientContainer>
              ) : null)}

            <DangerZone
              contract={contract}
              showResolver={showResolver}
              setShowResolver={setShowResolver}
              showReview={showReview}
              setShowReview={setShowReview}
              userHasBet={!!contractMetrics}
              hasReviewed={!!userHasReviewed}
            />
            <ContractDescription contract={contract} />
            <Row className="my-2 flex-wrap items-center justify-between gap-y-2"></Row>
            {showExplainerPanel && (
              <PoliticsExplainerPanel
                header="What is this?"
                className="bg-canvas-50 -mx-4 max-w-[60ch] p-4 pb-0 xl:hidden"
              />
            )}
            {!user && <SidebarSignUpButton className="mb-4 flex md:hidden" />}
            {!!user && (
              <ContractSharePanel
                isClosed={isClosed}
                isCreator={isCreator}
                showResolver={showResolver}
                contract={contract}
              />
            )}
            {contract.outcomeType !== 'BOUNTIED_QUESTION' && (
              <RelatedContractsGrid
                contracts={relatedMarkets}
                loadMore={loadMore}
              />
            )}
            {isResolved && resolution !== 'CANCEL' && (
              <>
                <ContractLeaderboard
                  topContractMetrics={topContractMetrics.filter(
                    (metric) => metric.userUsername !== HOUSE_BOT_USERNAME
                  )}
                  contractId={contract.id}
                  currentUser={user}
                  currentUserMetrics={contractMetrics}
                />
                <Spacer h={12} />
              </>
            )}
            <div ref={tabsContainerRef}>
              <ContractTabs
                // Pass cached contract so it won't rerender so many times.
                contract={cachedContract}
                bets={bets}
                totalTrades={totalBets}
                comments={comments}
                userPositionsByOutcome={userPositionsByOutcome}
                totalPositions={totalPositions}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                blockedUserIds={blockedUserIds}
                activeIndex={activeTabIndex}
                setActiveIndex={setActiveTabIndex}
                pinnedComments={[]}
                appRouter={true}
              />
            </div>
            {contract.outcomeType === 'BOUNTIED_QUESTION' && (
              <RelatedContractsGrid
                contracts={relatedMarkets}
                loadMore={loadMore}
              />
            )}
          </Col>
        </Col>
        <Col className="hidden min-h-full max-w-[375px] xl:flex">
          {showExplainerPanel && (
            <PoliticsExplainerPanel
              className="max-w-[60ch]"
              header={'What is this?'}
            />
          )}

          <RelatedContractsList
            contracts={relatedMarkets}
            loadMore={loadMore}
          />
        </Col>
      </Row>

      <ScrollToTopButton className="fixed bottom-16 right-2 z-20 lg:bottom-2 xl:hidden" />
    </>
  )
}
