import { StarIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { unserializeBase64Multi } from 'common/chart'
import {
  ContractParams,
  MaybeAuthedContractParams,
  tradingAllowed,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { HOUSE_BOT_USERNAME, SPICE_MARKET_TOOLTIP } from 'common/envs/constants'
import { getTopContractMetrics } from 'common/supabase/contract-metrics'
import { User } from 'common/user'
import { mergeWith, uniqBy } from 'lodash'
import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollToTopButton } from 'web/components/buttons/scroll-to-top-button'
import { SidebarSignUpButton } from 'web/components/buttons/sign-up-button'
import { getMultiBetPoints } from 'web/components/charts/contract/choice'
import { BackButton } from 'web/components/contract/back-button'
import { ChangeBannerButton } from 'web/components/contract/change-banner-button'
import { AuthorInfo } from 'web/components/contract/contract-details'
import { ContractLeaderboard } from 'web/components/contract/contract-leaderboard'
import { ContractOverview } from 'web/components/contract/contract-overview'
import { ContractSEO } from 'web/components/contract/contract-seo'
import ContractSharePanel from 'web/components/contract/contract-share-panel'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { HeaderActions } from 'web/components/contract/header-actions'
import { MarketTopics } from 'web/components/contract/market-topics'
import {
  RelatedContractsGrid,
  SidebarRelatedContractsList,
} from 'web/components/contract/related-contracts-widget'
import { EditableQuestionTitle } from 'web/components/contract/editable-question-title'
import { ExplainerPanel } from 'web/components/explainer-panel'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { Rating, ReviewPanel } from 'web/components/reviews/stars'
import { GradientContainer } from 'web/components/widgets/gradient-container'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import {
  useBets,
  useRealtimeBets,
  useRealtimeBetsPolling,
} from 'web/hooks/use-bets-supabase'
import {
  useFirebasePublicContract,
  useIsPrivateContractMember,
} from 'web/hooks/use-contract-supabase'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { useRelatedMarkets } from 'web/hooks/use-related-contracts'
import { useReview } from 'web/hooks/use-review'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Contract } from 'web/lib/firebase/contracts'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import Custom404 from '../404'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'

import { Bet } from 'common/bet'
import { getContractParams } from 'common/contract-params'
import { getContractFromSlug } from 'common/supabase/contracts'

import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { DangerZone } from 'web/components/contract/danger-zone'
import { ContractDescription } from 'web/components/contract/contract-description'
import { ContractSummaryStats } from 'web/components/contract/contract-summary-stats'
import { parseJsonContentToText } from 'common/util/parse'
import { useRequestNewUserSignupBonus } from 'web/hooks/use-request-new-user-signup-bonus'
import { UserBetsSummary } from 'web/components/bet/bet-summary'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { DAY_MS } from 'common/util/time'
import { Title } from 'web/components/widgets/title'
import { base64toPoints } from 'common/edge/og'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { Tooltip } from 'web/components/widgets/tooltip'

export async function getStaticProps(ctx: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = ctx.params
  const adminDb = await initSupabaseAdmin()
  const contract = (await getContractFromSlug(contractSlug, adminDb)) ?? null

  if (!contract || contract.visibility === 'private') {
    return {
      notFound: true,
    }
  }

  if (contract.deleted) {
    return {
      props: {
        state: 'deleted',
        slug: contract.slug,
        visibility: contract.visibility,
      },
    }
  }

  const props = await getContractParams(contract, adminDb)
  return { props }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: MaybeAuthedContractParams) {
  if (props.state === 'deleted') {
    return (
      <Page trackPageView={false}>
        <div className="flex h-[50vh] flex-col items-center justify-center">
          <Title>Question deleted</Title>
        </div>
      </Page>
    )
  }

  return <NonPrivateContractPage contractParams={props.params} />
}

function NonPrivateContractPage(props: { contractParams: ContractParams }) {
  const { contract, pointsString } = props.contractParams

  const points = pointsString ? base64toPoints(pointsString) : []

  const inIframe = useIsIframe()
  if (!contract) {
    return <Custom404 customText="Unable to fetch question" />
  }
  if (inIframe) {
    return <ContractEmbedPage contract={contract} points={points} />
  }

  return (
    <Page trackPageView={false} className="xl:col-span-10">
      <ContractSEO contract={contract} points={pointsString} />
      <ContractPageContent key={contract.id} {...props.contractParams} />
    </Page>
  )
}

export function ContractPageContent(props: ContractParams) {
  const {
    userPositionsByOutcome,
    comments,
    totalPositions,
    relatedContracts,
    pointsString,
    multiPointsString,
    chartAnnotations,
    relatedContractsByTopicSlug,
    topics,
    dashboards,
    pinnedComments,
    betReplies,
    lastBetTime,
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
  if (!contract.viewCount) {
    contract.viewCount = props.contract.viewCount
  }

  const cachedContract = useMemo(
    () => contract,
    [
      contract.id,
      contract.resolution,
      contract.closeTime,
      'answers' in contract ? JSON.stringify(contract.answers) : undefined,
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
    'view market',
    {
      slug: contract.slug,
      contractId: contract.id,
      creatorId: contract.creatorId,
    },
    true,
    [user?.id] // track user view market event if they sign up/sign in on this page
  )
  useSaveContractVisitsLocally(user === null, contract.id)

  const isNumber = contract.outcomeType === 'NUMBER'

  const newBets =
    useRealtimeBetsPolling(
      {
        contractId: contract.id,
        afterTime: lastBetTime,
        filterRedemptions:
          contract.outcomeType !== 'MULTIPLE_CHOICE' && !isNumber,
        order: 'asc',
      },
      500,
      `contract-bets-${contract.id}-500ms-v1`
    ) ?? []

  const stringifiedNewBets = JSON.stringify(newBets)
  const newBetsWithoutRedemptions = newBets.filter((bet) => !bet.isRedemption)
  const totalBets =
    props.totalBets +
    (isNumber
      ? uniqBy(newBetsWithoutRedemptions, 'betGroupId').length
      : newBetsWithoutRedemptions.length)
  const bets = useMemo(
    () => uniqBy(isNumber ? newBets : newBetsWithoutRedemptions, 'id'),
    [stringifiedNewBets]
  )

  const betPoints = useMemo(() => {
    if (
      contract.outcomeType === 'MULTIPLE_CHOICE' ||
      contract.outcomeType === 'NUMBER'
    ) {
      const data = multiPointsString
        ? unserializeBase64Multi(multiPointsString)
        : []
      const newData =
        contract.mechanism === 'cpmm-multi-1' ? getMultiBetPoints(newBets) : []

      return mergeWith(data, newData, (array1, array2) =>
        [...(array1 ?? []), ...(array2 ?? [])].sort((a, b) => a.x - b.x)
      )
    } else {
      const points = pointsString ? base64toPoints(pointsString) : []
      const newPoints = newBets.map((bet) => ({
        x: bet.createdTime,
        y: bet.probAfter,
      }))
      return [...points, ...newPoints]
    }
  }, [pointsString, stringifiedNewBets])

  const { isResolved, outcomeType, resolution, closeTime, creatorId } = contract

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
  // Request new user signup bonus on every contract page visited
  useRequestNewUserSignupBonus(contract.id)
  const [replyTo, setReplyTo] = useState<Answer | Bet>()

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

  const { contracts: relatedMarkets, loadMore } = useRelatedMarkets(
    contract,
    relatedContracts
  )

  // detect whether header is stuck by observing if title is visible
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  const showExplainerPanel =
    user === null || (user && user.createdTime > Date.now() - 3 * DAY_MS)

  const [justNowReview, setJustNowReview] = useState<null | Rating>(null)
  const userReview = useReview(contract.id, user?.id)
  const userHasReviewed = userReview || justNowReview
  const [justBet, setJustBet] = useState(false)
  useEffect(() => {
    if (!user || !user.lastBetTime) return
    const hasJustBet = user.lastBetTime > Date.now() - 3000
    setJustBet(hasJustBet)
  }, [user?.lastBetTime])
  const showRelatedMarketsBelowBet =
    parseJsonContentToText(contract.description).trim().length >= 200

  const isSpiceMarket = !!contract.isSpicePayout

  return (
    <>
      {contract.visibility == 'private' && isAdmin && user && (
        <PrivateContractAdminTag contract={contract} user={user} />
      )}
      {contract.visibility !== 'public' && (
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
          {coverImageUrl && (
            <Row className="h-10 w-full justify-between">
              {/* Wrap in div so that justify-between works when BackButton is null. */}
              <div>
                <BackButton className="pr-8" />
              </div>
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
          <Col className={clsx('mb-4 p-4 pt-0 md:pb-8 lg:px-8')}>
            <Col className="w-full gap-3 lg:gap-4">
              <Col>
                <div ref={titleRef}>
                  <VisibilityIcon
                    contract={contract}
                    isLarge
                    className="mr-1"
                  />
                  <EditableQuestionTitle
                    contract={contract}
                    canEdit={isAdmin || isCreator || isMod}
                  />
                </div>
                <Row className="items-center gap-2">
                  <MarketTopics
                    contract={contract}
                    dashboards={dashboards}
                    topics={topics}
                    isSpiceMarket={isSpiceMarket}
                  />
                </Row>
              </Col>

              <div className="text-ink-600 flex flex-wrap items-center justify-between gap-y-1 text-sm">
                <AuthorInfo contract={contract} />

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

              {!tradingAllowed(contract) && (
                <UserBetsSummary
                  className="border-ink-200 !mb-2 mt-2 "
                  contract={contract}
                />
              )}

              <YourTrades contract={contract} />
            </Col>
            {showRelatedMarketsBelowBet && (
              <RelatedContractsGrid
                contracts={relatedMarkets}
                loadMore={loadMore}
                showOnlyAfterBet={true}
                justBet={justBet}
              />
            )}
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
            {!user && <SidebarSignUpButton className="mb-4 flex md:hidden" />}
            {!!user && (
              <ContractSharePanel
                isClosed={isClosed}
                isCreator={isCreator}
                showResolver={showResolver}
                contract={contract}
              />
            )}
            {showExplainerPanel && (
              <ExplainerPanel className="bg-canvas-50 -mx-4 p-4 pb-0 md:-mx-8 xl:hidden" />
            )}
            {comments.length > 3 && (
              <RelatedContractsGrid
                contracts={relatedMarkets}
                loadMore={loadMore}
                justBet={!showRelatedMarketsBelowBet && justBet}
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

            <div ref={tabsContainerRef} className="mb-4">
              <ContractTabs
                // Pass cached contract so it won't rerender so many times.
                contract={cachedContract}
                bets={bets}
                totalBets={totalBets}
                comments={comments}
                userPositionsByOutcome={userPositionsByOutcome}
                totalPositions={totalPositions}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                blockedUserIds={blockedUserIds}
                activeIndex={activeTabIndex}
                setActiveIndex={setActiveTabIndex}
                pinnedComments={pinnedComments}
                betReplies={betReplies}
              />
            </div>
            <RelatedContractsGrid
              contracts={relatedMarkets}
              loadMore={loadMore}
              contractsByTopicSlug={relatedContractsByTopicSlug}
              topics={topics}
              showAll={true}
            />
          </Col>
        </Col>
        <Col className="hidden min-h-full max-w-[375px] xl:flex">
          {showExplainerPanel && <ExplainerPanel />}

          <SidebarRelatedContractsList
            contracts={relatedMarkets}
            loadMore={loadMore}
            topics={topics}
            contractsByTopicSlug={relatedContractsByTopicSlug}
          />
        </Col>
      </Row>

      <ScrollToTopButton className="fixed bottom-16 right-2 z-20 lg:bottom-2 xl:hidden" />
    </>
  )
}

function PrivateContractAdminTag(props: { contract: Contract; user: User }) {
  const { contract, user } = props
  const isPrivateContractMember = useIsPrivateContractMember(
    user.id,
    contract.id
  )
  if (isPrivateContractMember) return <></>
  return (
    <Row className="sticky top-0 z-50 justify-end">
      <div className="rounded bg-red-200/80 px-4 py-2 text-lg font-bold text-red-500">
        ADMIN
      </div>
    </Row>
  )
}

function YourTrades(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()

  const betFilterOptions = {
    contractId: contract.id,
    userId: user === undefined ? 'loading' : user?.id ?? '_',
    filterAntes: true,
    order: 'asc',
  } as const
  const staticBets = useBets(betFilterOptions)
  const { rows } = useRealtimeBets(betFilterOptions)
  const userBets = rows ?? staticBets ?? []

  const visibleUserBets = userBets.filter(
    (bet) => !bet.isRedemption && bet.amount !== 0
  )

  if (visibleUserBets.length === 0) return null
  return (
    <Col>
      <div className="text-ink-700 text-lg">Your trades</div>
      <ContractBetsTable
        contract={contract}
        bets={userBets}
        isYourBets
        truncate
      />
    </Col>
  )
}
