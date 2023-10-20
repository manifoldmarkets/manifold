import { UserIcon, XIcon, ChartBarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { first, mergeWith } from 'lodash'
import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Answer, DpmAnswer } from 'common/answer'
import {
  MultiSerializedPoints,
  unserializeMultiPoints,
  unserializePoints,
} from 'common/chart'
import { ContractParams, MaybeAuthedContractParams } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import {
  ENV_CONFIG,
  HOUSE_BOT_USERNAME,
  isTrustworthy,
} from 'common/envs/constants'
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
import { getTopContractMetrics } from 'common/supabase/contract-metrics'
import ContractSharePanel from 'web/components/contract/contract-share-panel'
import { HeaderActions } from 'web/components/contract/header-actions'
import { EditableQuestionTitle } from 'web/components/contract/title-edit'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { ReviewPanel } from 'web/components/reviews/stars'
import { GradientContainer } from 'web/components/widgets/gradient-container'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAdmin } from 'web/hooks/use-admin'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import Custom404 from '../404'
import ContractEmbedPage from 'web/pages/embed/[username]/[contractSlug]'
import { ExplainerPanel } from 'web/components/explainer-panel'
import { SidebarSignUpButton } from 'web/components/buttons/sign-up-button'
import { MarketTopics } from 'web/components/contract/market-topics'
import { getMultiBetPoints } from 'web/components/charts/contract/choice'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { ContractSEO } from 'web/components/contract/contract-seo'
import { getContractFromSlug } from 'common/supabase/contracts'
import { Bet } from 'common/bet'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { DangerZone } from 'web/components/contract/danger-zone'
import {
  formatMoney,
  formatWithCommas,
  shortFormatNumber,
} from 'common/util/format'
import { TbDroplet } from 'react-icons/tb'
import { getContractParams } from 'common/contract-params'
import { LovePage } from 'love/components/love-page'
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

  const props = await getContractParams(contract, adminDb)
  return { props }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: MaybeAuthedContractParams) {
  const { state } = props
  if (state === 'not found' || state === 'not authed') {
    return <Custom404 />
  }

  return (
    <LovePage trackPageView={false} className="xl:col-span-10">
      <NonPrivateContractPage contractParams={props.params} />
    </LovePage>
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
        <ContractPageContent key={contract.id} {...props.contractParams} />
      </>
    )
}

export function ContractPageContent(props: ContractParams) {
  const { userPositionsByOutcome, comments, totalPositions, historyData } =
    props

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
  const lastBetTime = first(historyData.bets)?.createdTime

  const newBets =
    useRealtimeBets({
      contractId: contract.id,
      afterTime: lastBetTime,
      filterRedemptions: contract.outcomeType !== 'MULTIPLE_CHOICE',
      order: 'asc',
    }) ?? []
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
  const [showResolver, setShowResolver] = useState(false)

  const [showReview, setShowReview] = useState(false)

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

  // detect whether header is stuck by observing if title is visible
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  const showExplainerPanel =
    user === null ||
    (user && user.createdTime > Date.now() - 24 * 60 * 60 * 1000)

  return (
    <>
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
              <div className="absolute -top-10 bottom-0 left-0 right-0 -z-10">
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
                  <Row className=" w-full justify-between">
                    <Col className="my-auto">
                      <BackButton />
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

              <div className="text-ink-600 flex flex-wrap items-center justify-between gap-y-1 text-sm">
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
                      <div>{formatWithCommas(uniqueBettorCount ?? 0)}</div>
                    </Tooltip>

                    {!!contract.volume && (
                      <Tooltip
                        text={`Trading volume: ${formatMoney(contract.volume)}`}
                        placement="bottom"
                        noTap
                        className="hidden flex-row items-center gap-1 sm:flex"
                      >
                        <ChartBarIcon className="text-ink-500 h-4 w-4" />Ṁ
                        {shortFormatNumber(contract.volume)}
                      </Tooltip>
                    )}

                    {(contract.mechanism === 'cpmm-1' ||
                      contract.mechanism === 'cpmm-multi-1') && (
                      <Tooltip
                        text={`Subsidy pool: ${formatMoney(
                          contract.totalLiquidity
                        )}`}
                        placement="bottom"
                        noTap
                        className="flex flex-row items-center gap-1"
                      >
                        <TbDroplet className="stroke-ink-500 h-4 w-4 stroke-[3]" />
                        <div>
                          {ENV_CONFIG.moneyMoniker}
                          {shortFormatNumber(contract.totalLiquidity)}
                        </div>
                      </Tooltip>
                    )}

                    <CloseOrResolveTime
                      contract={contract}
                      editable={isCreator || isAdmin || trustworthy}
                    />
                  </div>
                )}
              </div>

              <ContractOverview
                contract={contract}
                betPoints={betPoints as any}
                showResolver={showResolver}
                setShowResolver={setShowResolver}
                onAnswerCommentClick={setReplyTo}
              />
            </Col>
            {showReview && user && (
              <div className="relative my-2">
                <ReviewPanel
                  marketId={contract.id}
                  author={contract.creatorName}
                  user={user}
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
            />
            <ContractDescription contract={contract} />
            <Row className="my-2 flex-wrap items-center justify-between gap-y-2"></Row>
            {showExplainerPanel && (
              <ExplainerPanel className="bg-canvas-50 -mx-4 p-4 pb-0 xl:hidden" />
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
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                blockedUserIds={blockedUserIds}
                activeIndex={activeTabIndex}
                setActiveIndex={setActiveTabIndex}
              />
            </div>
          </Col>
        </Col>
        <Col className="hidden min-h-full max-w-[375px] xl:flex">
          {showExplainerPanel && <ExplainerPanel />}
          <div className="w-[300px]" />
        </Col>
      </Row>

      <Spacer className="xl:hidden" h={10} />
      <ScrollToTopButton className="fixed bottom-16 right-2 z-20 lg:bottom-2 xl:hidden" />
    </>
  )
}
