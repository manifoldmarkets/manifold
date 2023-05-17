import { UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { ContractParams, visibility } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getContractOGProps, getSeoDescription } from 'common/contract-seo'
import { HOUSE_BOT_USERNAME, isTrustworthy } from 'common/envs/constants'
import { CONTRACT_BET_FILTER } from 'common/supabase/bets'
import { removeUndefinedProps } from 'common/util/object'
import { first } from 'lodash'
import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { UserBetsSummary } from 'web/components/bet/bet-summary'
import { DeleteMarketButton } from 'web/components/buttons/delete-market-button'
import { ScrollToTopButton } from 'web/components/buttons/scroll-to-top-button'
import { BackButton } from 'web/components/contract/back-button'
import { ContractDescription } from 'web/components/contract/contract-description'
import {
  AuthorInfo,
  CloseOrResolveTime,
  MarketGroups,
} from 'web/components/contract/contract-details'
import { ContractLeaderboard } from 'web/components/contract/contract-leaderboard'
import { ContractOverview } from 'web/components/contract/contract-overview'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { CreatorShareBoostPanel } from 'web/components/contract/creator-share-panel'
import { ExtraContractActionsRow } from 'web/components/contract/extra-contract-actions-row'
import { PrivateContractPage } from 'web/components/contract/private-contract'
import { QfResolutionPanel } from 'web/components/contract/qf-overview'
import { RelatedContractsList } from 'web/components/contract/related-contracts-widget'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { AlertBox } from 'web/components/widgets/alert-box'
import { GradientContainer } from 'web/components/widgets/gradient-container'
import { Linkify } from 'web/components/widgets/linkify'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAdmin } from 'web/hooks/use-admin'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { useContract } from 'web/hooks/use-contracts'
import { useEvent } from 'web/hooks/use-event'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { useRelatedMarkets } from 'web/hooks/use-related-contracts'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { getContractParams } from 'web/lib/firebase/api'
import { getTopContractMetrics } from 'web/lib/firebase/contract-metrics'
import { Contract, tradingAllowed } from 'web/lib/firebase/contracts'
import { track } from 'web/lib/service/analytics'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import Custom404 from '../404'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'
import { User } from 'common/user'
import { BetSignUpPrompt } from 'web/components/sign-up-prompt'
import { PlayMoneyDisclaimer } from 'web/components/play-money-disclaimer'

export type ContractParameters = {
  contractSlug: string
  visibility: visibility | null
  contractParams?: ContractParams
}

export async function getStaticProps(ctx: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = ctx.params

  try {
    const props = await getContractParams({
      contractSlug,
      fromStaticProps: true,
    })
    return {
      props,
    }
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 404) {
      return {
        props: {
          contractSlug,
          visibility: null,
        },
        revalidate: 60,
      }
    }
    throw e
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: {
  visibility: visibility | null
  contractSlug: string
  contractParams?: ContractParams
}) {
  const { visibility, contractSlug, contractParams } = props

  if (!visibility) {
    return <Custom404 />
  }
  return (
    <Page className="!max-w-[1400px]" mainClassName="!col-span-10">
      {visibility == 'private' && (
        <PrivateContractPage contractSlug={contractSlug} />
      )}
      {visibility != 'private' && contractParams && (
        <NonPrivateContractPage contractParams={contractParams} />
      )}
    </Page>
  )
}

export function NonPrivateContractPage(props: {
  contractParams: ContractParams
}) {
  const { contract, historyData, pointsString } = props.contractParams

  const inIframe = useIsIframe()
  if (inIframe) {
    return <ContractEmbedPage contract={contract} historyData={historyData} />
  }
  if (!contract) {
    return <Custom404 customText="Unable to fetch market" />
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
    shareholderStats,
  } = contractParams
  const contract =
    useContract(contractParams.contract?.id) ?? contractParams.contract
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
      getTopContractMetrics(contract.id, 10).then(setTopContractMetrics)
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
  const newBets = useRealtimeBets({
    contractId: contract.id,
    afterTime: lastBetTime,
    ...CONTRACT_BET_FILTER,
  })
  const totalBets = contractParams.totalBets + (newBets?.length ?? 0)
  const bets = useMemo(
    () => contractParams.historyData.bets.concat(newBets ?? []),
    [contractParams.historyData.bets, newBets]
  )
  const betPoints = useMemo(
    () =>
      contractParams.historyData.points.concat(
        newBets?.map((bet) => ({
          x: bet.createdTime,
          y: bet.probAfter,
          obj: { userAvatarUrl: bet.userAvatarUrl },
        })) ?? []
      ),
    [contractParams.historyData.points, newBets]
  )

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

  const [showResolver, setShowResolver] = useState(
    (isCreator || isAdmin || (trustworthy && isClosed)) &&
      !isResolved &&
      (closeTime ?? 0) < Date.now() &&
      outcomeType !== 'STONK'
  )

  const allowTrade = tradingAllowed(contract)

  useSaveReferral(user, {
    defaultReferrerUsername: contract.creatorUsername,
    contractId: contract.id,
  })

  const [answerResponse, setAnswerResponse] = useState<Answer | undefined>(
    undefined
  )
  const tabsContainerRef = useRef<null | HTMLDivElement>(null)
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)
  const onAnswerCommentClick = useEvent((answer: Answer) => {
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
  const titleRef = useRef<any>(null)
  const [headerStuck, setStuck] = useState(false)
  useEffect(() => {
    const element = titleRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([e]) => setStuck(e.intersectionRatio < 1),
      { threshold: 1 }
    )
    observer.observe(element)
    return () => observer.unobserve(element)
  }, [titleRef])

  return (
    <>
      {creatorTwitter && (
        <Head>
          <meta name="twitter:creator" content={`@${creatorTwitter}`} />
        </Head>
      )}

      <Row className="w-full items-start gap-8 self-center">
        <Col
          className={clsx(
            'bg-canvas-0 w-full max-w-3xl rounded-b xl:w-[70%]',
            // Keep content in view when scrolling related markets on desktop.
            'sticky bottom-0 min-h-screen self-end'
          )}
        >
          <div
            className={clsx(
              'sticky z-50 flex items-end',
              !coverImageUrl ? 'bg-canvas-100 top-0' : 'top-[-92px] h-[140px]'
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
              </div>
            )}
            <div
              className={clsx(
                'sticky -top-px z-50 mt-px flex w-full justify-between py-2 px-4 transition-colors',
                headerStuck ? 'bg-black/20 backdrop-blur-2xl' : ''
              )}
            >
              <div className="mr-4 flex items-center truncate">
                <BackButton />
                {headerStuck && (
                  <span className="ml-4 text-white">{contract.question}</span>
                )}
              </div>
              <ExtraContractActionsRow contract={contract} />
            </div>
          </div>

          <Col className="mb-4 p-4 md:px-8 md:pb-8">
            <Col className="gap-3 sm:gap-4">
              <div ref={titleRef}>
                <Linkify
                  className="text-primary-700 text-lg font-medium sm:text-2xl"
                  text={contract.question}
                />
              </div>

              <div className="text-ink-600 flex items-center justify-between text-sm">
                <AuthorInfo contract={contract} />

                <div className="flex gap-4">
                  <Tooltip
                    text="Traders"
                    placement="bottom"
                    noTap
                    className="flex flex-row items-center gap-1"
                  >
                    <UserIcon className="text-ink-500 h-4 w-4" />
                    <div>{uniqueBettorCount ?? 0}</div>
                  </Tooltip>

                  <CloseOrResolveTime
                    contract={contract}
                    editable={user?.id === creatorId}
                  />
                </div>
              </div>

              {(outcomeType === 'FREE_RESPONSE' ||
                outcomeType === 'MULTIPLE_CHOICE') && (
                <>
                  <Spacer h={4} />
                  <AnswersPanel
                    contract={contract}
                    onAnswerCommentClick={onAnswerCommentClick}
                    showResolver={showResolver}
                  />
                  <Spacer h={4} />
                </>
              )}

              <ContractOverview
                contract={contract}
                bets={bets}
                betPoints={betPoints}
              />

              <SignUpFlow user={user} />
            </Col>

            {isCreator &&
              isResolved &&
              resolution === 'CANCEL' &&
              (!uniqueBettorCount || uniqueBettorCount < 10) && (
                <DeleteMarketButton
                  className="mt-4 self-end"
                  contractId={contract.id}
                />
              )}

            <ContractDescription
              className="mt-2 xl:mt-6"
              contract={contract}
              toggleResolver={() => setShowResolver(!showResolver)}
              showEditHistory={true}
            />

            <div className="my-4">
              <MarketGroups contract={contract} />
            </div>

            {showResolver &&
              user &&
              !resolution &&
              (outcomeType === 'PSEUDO_NUMERIC' ? (
                <GradientContainer>
                  <NumericResolutionPanel
                    isAdmin={!!isAdmin}
                    creator={user}
                    isCreator={!isAdmin}
                    contract={contract}
                  />
                </GradientContainer>
              ) : outcomeType === 'BINARY' ? (
                <GradientContainer>
                  <ResolutionPanel
                    isAdmin={isAdmin || trustworthy}
                    creator={user}
                    isCreator={!isAdmin}
                    contract={contract}
                  />
                </GradientContainer>
              ) : outcomeType === 'QUADRATIC_FUNDING' ? (
                <GradientContainer>
                  <QfResolutionPanel contract={contract} />
                </GradientContainer>
              ) : null)}

            {outcomeType === 'NUMERIC' && (
              <AlertBox
                title="Warning"
                text="Distributional numeric markets were introduced as an experimental feature and are now deprecated."
              />
            )}

            {isCreator && !isResolved && !isClosed && (
              <>
                {showResolver && <Spacer h={4} />}
                <CreatorShareBoostPanel contract={contract} />
              </>
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

            <UserBetsSummary
              className="mt-4 mb-2 px-2"
              contract={contract}
              initialMetrics={contractMetrics}
            />

            <div ref={tabsContainerRef}>
              <ContractTabs
                contract={contract}
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
                shareholderStats={shareholderStats}
              />
            </div>
          </Col>
        </Col>
        <RelatedContractsList
          className="hidden min-h-full max-w-[375px] xl:flex"
          contracts={relatedMarkets}
          onContractClick={(c) =>
            track('click related market', { contractId: c.id })
          }
          loadMore={loadMore}
        />
      </Row>
      <RelatedContractsList
        className="mx-auto mt-8 max-w-[600px] xl:hidden"
        contracts={relatedMarkets}
        onContractClick={(c) =>
          track('click related market', { contractId: c.id })
        }
        loadMore={loadMore}
      />
      <Spacer className="xl:hidden" h={10} />
      <ScrollToTopButton className="fixed bottom-16 right-2 z-20 lg:bottom-2 xl:hidden" />
    </>
  )
}

function SignUpFlow({ user }: { user: User | null | undefined }) {
  if (user === null)
    return (
      <Col className="mt-1 w-full">
        <BetSignUpPrompt className="xl:self-center" size="xl" />
        <PlayMoneyDisclaimer />
      </Col>
    )
  if (user === undefined) return <div className="h-[72px] w-full" />

  return <></>
}

export function ContractSEO(props: {
  contract: Contract
  /** Base64 encoded points */
  points?: string
}) {
  const { contract, points } = props
  const { question, creatorUsername, slug } = contract

  const seoDesc = getSeoDescription(contract)
  const ogCardProps = removeUndefinedProps({
    ...getContractOGProps(contract),
    points,
  })

  return (
    <SEO
      title={question}
      description={seoDesc}
      url={`/${creatorUsername}/${slug}`}
      ogProps={{ props: ogCardProps, endpoint: 'market' }}
    />
  )
}
