import React, { useEffect, useMemo, useRef, useState } from 'react'
import { first } from 'lodash'
import clsx from 'clsx'

import { ContractOverview } from 'web/components/contract/contract-overview'
import { Col } from 'web/components/layout/col'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Spacer } from 'web/components/layout/spacer'
import {
  Contract,
  getContractFromSlug,
  tradingAllowed,
} from 'web/lib/firebase/contracts'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { Bet, BetFilter, getTotalBetCount } from 'web/lib/firebase/bets'
import { getBets } from 'web/lib/supabase/bets'
import Custom404 from '../404'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { NumericBetPanel } from 'web/components/bet/numeric-bet-panel'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'
import { useBets } from 'web/hooks/use-bets'
import { AlertBox } from 'web/components/widgets/alert-box'
import { useTracking } from 'web/hooks/use-tracking'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { getContractOGProps, getSeoDescription } from 'common/contract-seo'
import { ContractDescription } from 'web/components/contract/contract-description'
import { ContractLeaderboard } from 'web/components/contract/contract-leaderboard'
import { useAdmin } from 'web/hooks/use-admin'
import { UserBetsSummary } from 'web/components/bet/bet-summary'
import { listAllComments } from 'web/lib/firebase/comments'
import { ContractComment } from 'common/comment'
import { ScrollToTopButton } from 'web/components/buttons/scroll-to-top-button'
import { Answer } from 'common/answer'
import { useEvent } from 'web/hooks/use-event'
import { useContract } from 'web/hooks/use-contracts'
import {
  getBinaryContractUserContractMetrics,
  ContractMetricsByOutcome,
  getTopContractMetrics,
} from 'web/lib/firebase/contract-metrics'
import { removeUndefinedProps } from 'common/util/object'
import { ContractMetric } from 'common/contract-metric'
import { HOUSE_BOT_USERNAME } from 'common/envs/constants'
import { HistoryPoint } from 'web/components/charts/generic-charts'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { BackRow } from 'web/components/contract/back-row'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { CreatorSharePanel } from 'web/components/contract/creator-share-panel'
import { getTotalContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { QfResolutionPanel } from 'web/components/contract/qf-overview'
import { compressPoints, pointsToBase64 } from 'common/util/og'
import { getInitialProbability } from 'common/calculate'
import { getUser } from 'web/lib/firebase/users'
import Head from 'next/head'
import { Linkify } from 'web/components/widgets/linkify'
import { ContractDetails } from 'web/components/contract/contract-details'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { RelatedContractsList } from 'web/components/contract/related-contracts-widget'
import { Row } from 'web/components/layout/row'
import {
  getInitialRelatedMarkets,
  useRelatedMarkets,
} from 'web/hooks/use-related-contracts'
import { track } from 'web/lib/service/analytics'

const CONTRACT_BET_FILTER: BetFilter = {
  filterRedemptions: true,
  filterChallenges: true,
  filterAntes: false,
}

type HistoryData = { bets: Bet[]; points: HistoryPoint<Partial<Bet>>[] }

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(ctx: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = ctx.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id
  const totalBets = contractId ? await getTotalBetCount(contractId) : 0
  const useBetPoints =
    contract?.outcomeType === 'BINARY' ||
    contract?.outcomeType === 'PSEUDO_NUMERIC'
  // Prioritize newer bets via descending order
  const bets = contractId
    ? await getBets({
        contractId,
        ...CONTRACT_BET_FILTER,
        limit: useBetPoints ? 50000 : 4000,
        order: 'desc',
      })
    : []
  const includeAvatar = totalBets < 1000
  const betPoints = useBetPoints
    ? bets.map(
        (bet) =>
          removeUndefinedProps({
            x: bet.createdTime,
            y: bet.probAfter,
            obj: includeAvatar
              ? { userAvatarUrl: bet.userAvatarUrl }
              : undefined,
          }) as HistoryPoint<Partial<Bet>>
      )
    : []
  const comments = contractId ? await listAllComments(contractId, 100) : []

  const userPositionsByOutcome =
    contractId && contract?.outcomeType === 'BINARY'
      ? await getBinaryContractUserContractMetrics(contractId, 100)
      : {}
  const topContractMetrics = contract?.resolution
    ? await getTopContractMetrics(contract.id, 10)
    : []
  const totalPositions =
    contractId && contract?.outcomeType === 'BINARY'
      ? await getTotalContractMetrics(contractId, db)
      : 0

  if (useBetPoints && contract) {
    const firstPoint = {
      x: contract.createdTime,
      y: getInitialProbability(contract),
    }
    betPoints.push(firstPoint)
    betPoints.reverse()
  }
  const pointsString = pointsToBase64(compressPoints(betPoints))

  const creator = contract && (await getUser(contract.creatorId))

  const relatedContracts = contract
    ? await getInitialRelatedMarkets(contract)
    : []

  return {
    props: removeUndefinedProps({
      contract,
      historyData: {
        bets: useBetPoints ? bets.slice(0, 100) : bets,
        points: betPoints,
      },
      pointsString,
      comments,
      userPositionsByOutcome,
      totalPositions,
      totalBets,
      topContractMetrics,
      creatorTwitter: creator?.twitterHandle,
      relatedContracts,
    }),
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: {
  contract: Contract | null
  historyData: HistoryData
  pointsString?: string
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  totalPositions: number
  totalBets: number
  topContractMetrics: ContractMetric[]
  creatorTwitter: string | undefined
  relatedContracts: Contract[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    historyData: { bets: [], points: [] },
    pointsString: '',
    comments: [],
    userPositionsByOutcome: {},
    totalBets: 0,
    topContractMetrics: [],
    totalPositions: 0,
    relatedContracts: [],
  }

  const inIframe = useIsIframe()
  if (inIframe) {
    return <ContractEmbedPage {...props} />
  }

  const { contract } = props

  if (!contract) {
    return <Custom404 />
  }

  return <ContractPageContent key={contract.id} {...{ ...props, contract }} />
}

export function ContractPageContent(
  props: Parameters<typeof ContractPage>[0] & {
    contract: Contract
  }
) {
  const {
    userPositionsByOutcome,
    comments,
    totalPositions,
    pointsString,
    creatorTwitter,
    relatedContracts,
  } = props
  const contract = useContract(props.contract?.id) ?? props.contract
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

  // Static props load bets in descending order by time
  const lastBetTime = first(props.historyData.bets)?.createdTime
  const newBets = useBets({
    contractId: contract.id,
    afterTime: lastBetTime,
    ...CONTRACT_BET_FILTER,
  })
  const totalBets = props.totalBets + (newBets?.length ?? 0)
  const bets = useMemo(
    () => props.historyData.bets.concat(newBets ?? []),
    [props.historyData.bets, newBets]
  )
  const betPoints = useMemo(
    () =>
      props.historyData.points.concat(
        newBets?.map((bet) => ({
          x: bet.createdTime,
          y: bet.probAfter,
          obj: { userAvatarUrl: bet.userAvatarUrl },
        })) ?? []
      ),
    [props.historyData.points, newBets]
  )

  const { isResolved, outcomeType, resolution, closeTime, creatorId } = contract

  const isAdmin = useAdmin()
  const isCreator = creatorId === user?.id
  const isClosed = closeTime && closeTime < Date.now()

  const [showResolver, setShowResolver] = useState(
    (isCreator || isAdmin) && !isResolved && (closeTime ?? 0) < Date.now()
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
      tabsContainerRef.current.scrollIntoView({ behavior: 'smooth' })
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

  return (
    <Page maxWidth="max-w-[1400px]">
      <ContractSEO contract={contract} points={pointsString} />
      {creatorTwitter && (
        <Head>
          <meta name="twitter:creator" content={`@${creatorTwitter}`} />
        </Head>
      )}

      {user && <BackRow />}

      <Row className="w-full items-start gap-8 self-center">
        <Col
          className={clsx(
            'bg-canvas-0 mb-4 w-full max-w-3xl rounded px-4 py-4 md:px-8 md:py-8 xl:mb-14 xl:w-[70%]',
            // Keep content in view when scrolling related markets on desktop.
            'sticky bottom-0 self-end'
          )}
        >
          <Col className="gap-3 sm:gap-4">
            <ContractDetails contract={contract} />
            <Linkify
              className="text-primary-700 text-lg sm:text-2xl"
              text={contract.question}
            />
            <ContractOverview
              contract={contract}
              bets={bets}
              betPoints={betPoints}
            />
          </Col>

          <ContractDescription
            className="mt-2 xl:mt-6"
            contract={contract}
            toggleResolver={() => setShowResolver(!showResolver)}
          />

          {showResolver &&
            user &&
            !resolution &&
            (outcomeType === 'NUMERIC' || outcomeType === 'PSEUDO_NUMERIC' ? (
              <NumericResolutionPanel
                isAdmin={!!isAdmin}
                creator={user}
                isCreator={!isAdmin}
                contract={contract}
              />
            ) : outcomeType === 'BINARY' ? (
              <ResolutionPanel
                isAdmin={!!isAdmin}
                creator={user}
                isCreator={!isAdmin}
                contract={contract}
              />
            ) : outcomeType === 'QUADRATIC_FUNDING' ? (
              <QfResolutionPanel contract={contract} />
            ) : null)}

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

          {outcomeType === 'NUMERIC' && (
            <AlertBox
              title="Warning"
              text="Distributional numeric markets were introduced as an experimental feature and are now deprecated."
            />
          )}

          {isCreator && !isResolved && !isClosed && (
            <>
              {showResolver && <Spacer h={4} />}
              <CreatorSharePanel contract={contract} />
            </>
          )}

          {outcomeType === 'NUMERIC' && allowTrade && (
            <NumericBetPanel className="xl:hidden" contract={contract} />
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
            />
          </div>
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
        className="max-w-[600px] xl:hidden"
        contracts={relatedMarkets}
        onContractClick={(c) =>
          track('click related market', { contractId: c.id })
        }
        loadMore={loadMore}
      />
      <Spacer className="xl:hidden" h={10} />
      <ScrollToTopButton className="fixed bottom-16 right-2 z-20 lg:bottom-2 xl:hidden" />
    </Page>
  )
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
