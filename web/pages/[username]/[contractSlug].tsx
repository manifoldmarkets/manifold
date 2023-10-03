import { UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { first, mergeWith } from 'lodash'
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Answer, DpmAnswer } from 'common/answer'
import {
  binAvg,
  maxMinBin,
  serializeMultiPoints,
  unserializeMultiPoints,
  unserializePoints,
} from 'common/chart'
import { ContractParams, MaybeAuthedContractParams } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { HOUSE_BOT_USERNAME, isTrustworthy } from 'common/envs/constants'
import { User } from 'common/user'
import { DeleteMarketButton } from 'web/components/buttons/delete-market-button'
import { ScrollToTopButton } from 'web/components/buttons/scroll-to-top-button'
import { BackButton } from 'web/components/contract/back-button'
import { BountyLeft } from 'web/components/contract/bountied-question'
import { ChangeBannerButton } from 'web/components/contract/change-banner-button'
import { ContractDescription } from 'web/components/contract/contract-description'
import {
  AuthorInfo,
  CloseOrResolveTime,
} from 'web/components/contract/contract-details'
import { ContractLeaderboard } from 'web/components/contract/contract-leaderboard'
import { ContractOverview } from 'web/components/contract/contract-overview'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import {
  getCPMMContractUserContractMetrics,
  getTopContractMetrics,
  getTotalContractMetrics,
} from 'common/supabase/contract-metrics'
import ContractSharePanel from 'web/components/contract/contract-share-panel'
import { ExtraContractActionsRow } from 'web/components/contract/extra-contract-actions-row'
import { PrivateContractPage } from 'web/components/contract/private-contract'
import {
  RelatedContractsCarousel,
  RelatedContractsList,
} from 'web/components/contract/related-contracts-widget'
import { EditableQuestionTitle } from 'web/components/contract/title-edit'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { ReviewPanel } from 'web/components/reviews/stars'
import { GradientContainer } from 'web/components/widgets/gradient-container'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAdmin } from 'web/hooks/use-admin'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import {
  useFirebasePublicContract,
  useIsPrivateContractMember,
} from 'web/hooks/use-contract-supabase'
import { useEvent } from 'web/hooks/use-event'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { useRelatedMarkets } from 'web/hooks/use-related-contracts'
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
import { ExplainerPanel } from 'web/components/explainer-panel'
import { SidebarSignUpButton } from 'web/components/buttons/sign-up-button'
import { linkClass } from 'web/components/widgets/site-link'
import { MarketTopics } from 'web/components/contract/market-topics'
import { getMultiBetPoints } from 'web/components/charts/contract/choice'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { ContractSEO } from 'web/components/contract/contract-seo'
import { getContractFromSlug } from 'common/supabase/contracts'
import { getBetPoints, getBets, getTotalBetCount } from 'common/supabase/bets'
import { getRecentTopLevelCommentsAndReplies } from 'common/supabase/comments'
import { getRelatedContracts } from 'common/supabase/related-contracts'
import { buildArray } from 'common/util/array'
import { getInitialProbability } from 'common/calculate'
import { calculateMultiBets } from 'common/bet'
import { pointsToBase64 } from 'common/util/og'
import { removeUndefinedProps } from 'common/util/object'
import { getUser } from 'web/lib/supabase/user'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'

export async function getStaticProps(ctx: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = ctx.params
  const adminDb = await initSupabaseAdmin()
  const contract = (await getContractFromSlug(contractSlug, adminDb)) ?? null

  if (!contract)
    return {
      props: { state: 'not found' },
      revalidate: 60,
    }

  if (contract.visibility === 'private')
    return {
      props: { state: 'not authed', slug: contract.slug },
      revalidate: 60,
    }

  if (contract.deleted) {
    return {
      props: {
        state: 'not authed',
        slug: contract.slug,
        visibility: contract.visibility,
      },
    }
  }

  const isCpmm1 = contract.mechanism === 'cpmm-1'
  const hasMechanism = contract.mechanism !== 'none'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const isBinaryDpm =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'dpm-2'

  const [
    totalBets,
    betsToPass,
    allBetPoints,
    comments,
    userPositionsByOutcome,
    topContractMetrics,
    totalPositions,
    creator,
    relatedContracts,
  ] = await Promise.all([
    hasMechanism ? getTotalBetCount(contract.id, db) : 0,
    hasMechanism
      ? getBets(db, {
          contractId: contract.id,
          limit: 100,
          order: 'desc',
          filterAntes: true,
          filterRedemptions: true,
        })
      : [],
    hasMechanism
      ? getBetPoints(db, contract.id, contract.mechanism === 'cpmm-multi-1')
      : [],
    getRecentTopLevelCommentsAndReplies(db, contract.id, 25),
    isCpmm1 ? getCPMMContractUserContractMetrics(contract.id, 100, db) : {},
    contract.resolution ? getTopContractMetrics(contract.id, 10, db) : [],
    isCpmm1 ? getTotalContractMetrics(contract.id, db) : 0,
    getUser(contract.creatorId),
    getRelatedContracts(contract, 20, db, true),
  ])

  const chartPoints =
    isCpmm1 || isBinaryDpm
      ? buildArray<{ x: number; y: number }>(
          isCpmm1 && {
            x: contract.createdTime,
            y: getInitialProbability(contract),
          },
          maxMinBin(allBetPoints, 500)
        ).map((p) => [p.x, p.y] as const)
      : isMulti
      ? serializeMultiPoints(calculateMultiBets(allBetPoints))
      : []

  const ogPoints = isCpmm1 ? binAvg(allBetPoints) : []
  const pointsString = pointsToBase64(ogPoints.map((p) => [p.x, p.y] as const))

  return {
    props: {
      state: 'authed',
      params: removeUndefinedProps({
        outcomeType: contract.outcomeType,
        contract,
        historyData: {
          bets: betsToPass,
          points: chartPoints,
        },
        pointsString,
        comments,
        userPositionsByOutcome,
        totalPositions,
        totalBets,
        topContractMetrics,
        creatorTwitter: creator,
        relatedContracts,
      }),
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: MaybeAuthedContractParams) {
  if (props.state === 'not found') {
    return <Custom404 />
  }

  return (
    <Page trackPageView={false} className="xl:col-span-10">
      {props.state === 'not authed' ? (
        <PrivateContractPage contractSlug={props.slug} />
      ) : (
        <NonPrivateContractPage contractParams={props.params} />
      )}
    </Page>
  )
}

function NonPrivateContractPage(props: { contractParams: ContractParams }) {
  const { contract, historyData, pointsString } = props.contractParams

  const points =
    contract.outcomeType !== 'MULTIPLE_CHOICE'
      ? unserializePoints(historyData.points as any)
      : []

  const inIframe = useIsIframe()
  if (!contract) {
    return <Custom404 customText="Unable to fetch question" />
  } else if (inIframe) {
    return <ContractEmbedPage contract={contract} points={points} />
  } else
    return (
      <>
        <ContractSEO contract={contract} points={pointsString} />
        <ContractPageContent
          key={contract.id}
          contractParams={props.contractParams}
        />
      </>
    )
}

export function ContractPageContent(props: {
  contractParams: ContractParams & { contract: Contract }
}) {
  const { contractParams } = props
  const {
    userPositionsByOutcome,
    comments,
    totalPositions,
    creatorTwitter,
    relatedContracts,
  } = contractParams
  const contract =
    useFirebasePublicContract(
      contractParams.contract.visibility,
      contractParams.contract.id
    ) ?? contractParams.contract
  if (
    'answers' in contractParams.contract &&
    contract.mechanism === 'cpmm-multi-1'
  ) {
    ;(contract as any).answers =
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useAnswersCpmm(contract.id) ?? contractParams.contract.answers
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
  >(contractParams.topContractMetrics)

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
    true
  )
  useSaveContractVisitsLocally(user === null, contract.id)

  // Static props load bets in descending order by time
  const lastBetTime = first(contractParams.historyData.bets)?.createdTime

  const newBets =
    useRealtimeBets({
      contractId: contract.id,
      afterTime: lastBetTime,
      filterRedemptions: contract.outcomeType !== 'MULTIPLE_CHOICE',
      order: 'asc',
    }) ?? []
  const newBetsWithoutRedemptions = newBets.filter((bet) => !bet.isRedemption)
  const totalBets = contractParams.totalBets + newBetsWithoutRedemptions.length
  const bets = useMemo(
    () => [...contractParams.historyData.bets, ...newBetsWithoutRedemptions],
    [contractParams.historyData.bets, newBets]
  )

  const betPoints = useMemo(() => {
    if (contract.outcomeType === 'MULTIPLE_CHOICE') {
      const data = unserializeMultiPoints(
        contractParams.historyData.points as any
      )
      const newData =
        contract.mechanism === 'cpmm-multi-1' ? getMultiBetPoints(newBets) : []

      return mergeWith(data, newData, (a, b) => [...(a ?? []), ...(b ?? [])])
    } else {
      const points = unserializePoints(contractParams.historyData.points as any)
      const newPoints = newBets.map((bet) => ({
        x: bet.createdTime,
        y: bet.probAfter,
        obj: { userAvatarUrl: bet.userAvatarUrl },
      }))
      return [...points, ...newPoints]
    }
  }, [contractParams.historyData.points, newBets])

  const {
    isResolved,
    outcomeType,
    resolution,
    closeTime,
    creatorId,
    coverImageUrl,
    uniqueBettorCount,
  } = contract

  const isAdmin = useAdmin()
  const isCreator = creatorId === user?.id
  const isClosed = !!(closeTime && closeTime < Date.now())
  const trustworthy = isTrustworthy(user?.username)

  // show the resolver by default if the market is closed and you can resolve it
  const [showResolver, setShowResolver] = useState(false)

  useEffect(() => {
    // Close resolve panel if you just resolved it.
    if (isResolved) setShowResolver(false)
    else if (
      (isCreator || isAdmin || trustworthy) &&
      (closeTime ?? 0) < Date.now() &&
      outcomeType !== 'STONK' &&
      contract.mechanism !== 'none'
    ) {
      setShowResolver(true)
    }
  }, [isAdmin, isCreator, trustworthy, closeTime, isResolved])

  useSaveReferral(user, {
    defaultReferrerUsername: contract.creatorUsername,
    contractId: contract.id,
  })

  const [answerResponse, setAnswerResponse] = useState<
    Answer | DpmAnswer | undefined
  >(undefined)
  const tabsContainerRef = useRef<null | HTMLDivElement>(null)
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)
  const onAnswerCommentClick = useEvent((answer: Answer | DpmAnswer) => {
    setAnswerResponse(answer)
    if (tabsContainerRef.current) {
      scrollIntoViewCentered(tabsContainerRef.current)
      setActiveTabIndex(0)
    } else {
      console.error('no ref to scroll to')
    }
  })
  const onCancelAnswerResponse = useEvent(() => setAnswerResponse(undefined))

  const { contracts: relatedMarkets, loadMore } = useRelatedMarkets(
    contract,
    relatedContracts
  )

  // detect whether header is stuck by observing if title is visible
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  const showExplainerPanel =
    user === null ||
    (user && user.createdTime > Date.now() - 24 * 60 * 60 * 1000)

  return (
    <>
      {creatorTwitter && (
        <Head>
          <meta name="twitter:creator" content={`@${creatorTwitter}`} />
        </Head>
      )}
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
            'sticky bottom-0 min-h-screen self-end'
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
              <div className="absolute bottom-0 left-0 right-0 -top-10 -z-10">
                <Image
                  fill
                  alt=""
                  sizes="100vw"
                  className="object-cover"
                  src={coverImageUrl}
                  priority={true}
                />
                <ChangeBannerButton
                  contract={contract}
                  className="absolute top-12 right-4"
                />
              </div>
            )}
            <Row
              className={clsx(
                'sticky -top-px z-50 mt-px flex h-12 w-full py-2 px-4 transition-colors',
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
                <ExtraContractActionsRow contract={contract}>
                  {!coverImageUrl && isCreator && (
                    <ChangeBannerButton
                      contract={contract}
                      className="ml-3 first:ml-0"
                    />
                  )}
                </ExtraContractActionsRow>
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
                  <Row className=" w-full justify-between">
                    <Col className="my-auto">
                      <BackButton />
                    </Col>
                    <ExtraContractActionsRow contract={contract}>
                      {!coverImageUrl && isCreator && (
                        <ChangeBannerButton
                          contract={contract}
                          className="ml-3 first:ml-0"
                        />
                      )}
                    </ExtraContractActionsRow>
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
                <MarketTopics contract={contract} />
              </Col>

              <div className="text-ink-600 flex items-center justify-between text-sm">
                <AuthorInfo contract={contract} />

                {contract.outcomeType == 'BOUNTIED_QUESTION' ? (
                  <BountyLeft
                    bountyLeft={contract.bountyLeft}
                    totalBounty={contract.totalBounty}
                    inEmbed={true}
                  />
                ) : (
                  <div className="flex gap-4">
                    <Tooltip
                      text={
                        contract.outcomeType == 'POLL' ? 'Voters' : 'Traders'
                      }
                      placement="bottom"
                      noTap
                      className="flex flex-row items-center gap-1"
                    >
                      <UserIcon className="text-ink-500 h-4 w-4" />
                      <div>{uniqueBettorCount ?? 0}</div>
                    </Tooltip>

                    <CloseOrResolveTime
                      contract={contract}
                      editable={isCreator || isAdmin}
                    />
                  </div>
                )}
              </div>

              <ContractOverview
                contract={contract}
                betPoints={betPoints as any}
                showResolver={showResolver}
                onAnswerCommentClick={onAnswerCommentClick}
              />
            </Col>

            {isCreator &&
              isResolved &&
              resolution === 'CANCEL' &&
              (!uniqueBettorCount || uniqueBettorCount < 2) && (
                <DeleteMarketButton
                  className="mt-4 self-end"
                  contractId={contract.id}
                />
              )}

            <ContractDescription
              className="mt-2"
              contract={contract}
              highlightResolver={!isResolved && isClosed && !showResolver}
              toggleResolver={() => setShowResolver((shown) => !shown)}
              showEditHistory={true}
            />

            {showResolver &&
              user &&
              !resolution &&
              (outcomeType === 'PSEUDO_NUMERIC' ? (
                <GradientContainer className="my-2">
                  <NumericResolutionPanel
                    isAdmin={isAdmin}
                    creator={user}
                    isCreator={!isAdmin}
                    contract={contract}
                  />
                </GradientContainer>
              ) : outcomeType === 'BINARY' ? (
                <GradientContainer className="my-2">
                  <ResolutionPanel
                    isAdmin={isAdmin || trustworthy}
                    creator={user}
                    isCreator={!isAdmin}
                    contract={contract}
                  />
                </GradientContainer>
              ) : null)}

            {isResolved &&
              // resolved less than week ago
              (Date.now() - (contract.resolutionTime ?? 0)) / 1000 <
                60 * 60 * 24 * 7 &&
              user &&
              user.id !== contract.creatorId &&
              contract.outcomeType !== 'POLL' && (
                <ReviewPanel
                  marketId={contract.id}
                  author={contract.creatorName}
                  user={user}
                  className="my-2"
                />
              )}

            <Row className="my-2 flex-wrap items-center justify-between gap-y-2">
              {outcomeType === 'BOUNTIED_QUESTION' && (
                <Link
                  className={clsx(linkClass, 'text-primary-500 ml-2 text-sm')}
                  href={`/browse?s=score&f=open&ct=BOUNTIED_QUESTION`}
                >
                  See all bounties &rarr;
                </Link>
              )}
            </Row>

            {showExplainerPanel && (
              <ExplainerPanel className="bg-canvas-50 -mx-8 p-4 pb-0 xl:hidden" />
            )}

            {!user && <SidebarSignUpButton className="mb-4 flex md:hidden" />}

            {!!user && contract.outcomeType !== 'BOUNTIED_QUESTION' && (
              <ContractSharePanel
                isClosed={isClosed}
                isCreator={isCreator}
                showResolver={showResolver}
                contract={contract}
              />
            )}

            <RelatedContractsCarousel
              className="mt-4 mb-2 -ml-4 xl:hidden"
              contracts={relatedMarkets}
              onContractClick={(c) =>
                track('click related market', { contractId: c.id })
              }
              loadMore={loadMore}
            />

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
                totalBets={totalBets}
                comments={comments}
                userPositionsByOutcome={userPositionsByOutcome}
                totalPositions={totalPositions}
                answerResponse={answerResponse}
                onCancelAnswerResponse={onCancelAnswerResponse}
                blockedUserIds={blockedUserIds}
                activeIndex={activeTabIndex}
                setActiveIndex={setActiveTabIndex}
              />
            </div>
            {contract.outcomeType == 'BOUNTIED_QUESTION' && (
              <ContractSharePanel
                isClosed={isClosed}
                isCreator={isCreator}
                showResolver={showResolver}
                contract={contract}
                className={'mt-6 w-full'}
              />
            )}
          </Col>
        </Col>
        <Col className="hidden min-h-full max-w-[375px] xl:flex">
          {showExplainerPanel && <ExplainerPanel />}

          <RelatedContractsList
            contracts={relatedMarkets}
            onContractClick={(c) =>
              track('click related market', { contractId: c.id })
            }
            loadMore={loadMore}
          />
        </Col>
      </Row>

      <Spacer className="xl:hidden" h={10} />
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
