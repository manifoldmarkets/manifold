import React, { memo, useEffect, useRef, useState } from 'react'
import { first } from 'lodash'

import { ContractOverview } from 'web/components/contract/contract-overview'
import { BetPanel } from 'web/components/bet/bet-panel'
import { Col } from 'web/components/layout/col'
import { usePrivateUser, useUser, useUserById } from 'web/hooks/use-user'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { Spacer } from 'web/components/layout/spacer'
import {
  Contract,
  getContractFromSlug,
  getRecommendedContracts,
  tradingAllowed,
} from 'web/lib/firebase/contracts'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { Bet, getTotalBetCount, listBets } from 'web/lib/firebase/bets'
import Custom404 from '../404'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { NumericBetPanel } from 'web/components/bet/numeric-bet-panel'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'
import { useBets } from 'web/hooks/use-bets'
import { CPMMBinaryContract } from 'common/contract'
import { AlertBox } from 'web/components/widgets/alert-box'
import { useTracking } from 'web/hooks/use-tracking'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { getOpenGraphProps } from 'common/contract-details'
import { ContractDescription } from 'web/components/contract/contract-description'
import { ContractLeaderboard } from 'web/components/contract/contract-leaderboard'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'
import { BetsSummary } from 'web/components/bet/bet-summary'
import { listAllComments } from 'web/lib/firebase/comments'
import { ContractComment } from 'common/comment'
import { ScrollToTopButton } from 'web/components/buttons/scroll-to-top-button'
import { Answer } from 'common/answer'
import { useEvent } from 'web/hooks/use-event'
import { CreatorSharePanel } from 'web/components/contract/creator-share-panel'
import { useContract } from 'web/hooks/use-contracts'
import { BAD_CREATOR_THRESHOLD } from 'web/components/contract/contract-details'
import {
  getBinaryContractUserContractMetrics,
  ContractMetricsByOutcome,
  getTopContractMetrics,
  getTotalContractMetricsCount,
} from 'web/lib/firebase/contract-metrics'
import { OrderByDirection } from 'firebase/firestore'
import { removeUndefinedProps } from 'common/util/object'
import { ContractMetric } from 'common/contract-metric'
import { HOUSE_BOT_USERNAME } from 'common/envs/constants'

const CONTRACT_BET_FILTER = {
  filterRedemptions: true,
  filterChallenges: true,
}
export type BetPoint = { x: number; y: number; bet?: Partial<Bet> }

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id
  const totalBets = contractId ? await getTotalBetCount(contractId) : 0
  const useBetPoints =
    contract?.outcomeType === 'BINARY' ||
    contract?.outcomeType === 'PSEUDO_NUMERIC'
  // Prioritize newer bets via descending order
  const bets = contractId
    ? await listBets({
        contractId,
        ...CONTRACT_BET_FILTER,
        limit: useBetPoints ? 10000 : 4000,
        order: 'desc' as OrderByDirection,
      })
    : []
  const includeAvatar = totalBets < 1000
  const betPoints = useBetPoints
    ? bets.map(
        (bet) =>
          removeUndefinedProps({
            x: bet.createdTime,
            y: bet.probAfter,
            bet: includeAvatar
              ? { userAvatarUrl: bet.userAvatarUrl }
              : undefined,
          }) as BetPoint
      )
    : []
  const comments = contractId ? await listAllComments(contractId, 100) : []

  const userPositionsByOutcome =
    contractId && contract?.outcomeType === 'BINARY'
      ? await getBinaryContractUserContractMetrics(contractId, 100)
      : {}
  const topContractMetrics = contractId
    ? await getTopContractMetrics(contractId, 10)
    : []
  const totalPositions = contractId
    ? await getTotalContractMetricsCount(contractId)
    : 0

  return {
    props: {
      contract,
      bets: useBetPoints ? bets.slice(0, 100) : bets,
      comments,
      userPositionsByOutcome,
      betPoints,
      totalBets,
      topContractMetrics,
      totalPositions,
    },
    revalidate: 60,
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: {
  contract: Contract | null
  bets: Bet[]
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  betPoints: BetPoint[]
  totalBets: number
  topContractMetrics: ContractMetric[]
  totalPositions: number
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    bets: [],
    comments: [],
    userPositionsByOutcome: {},
    betPoints: [],
    totalBets: 0,
    topContractMetrics: [],
    totalPositions: 0,
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
    topContractMetrics,
    totalPositions,
  } = props
  const contract = useContract(props.contract?.id) ?? props.contract
  const user = useUser()
  const privateUser = usePrivateUser()
  const blockedUserIds = (privateUser?.blockedUserIds ?? []).concat(
    privateUser?.blockedByUserIds ?? []
  )
  const isCreator = user?.id === contract.creatorId

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
  const lastBetTime = first(props.bets)?.createdTime
  const newBets = useBets({
    contractId: contract.id,
    afterTime: lastBetTime,
    ...CONTRACT_BET_FILTER,
  })
  const totalBets = props.totalBets + (newBets?.length ?? 0)
  const bets = props.bets.concat(newBets ?? [])
  const betPoints = props.betPoints.concat(
    newBets?.map(
      (bet) =>
        ({
          x: bet.createdTime,
          y: bet.probAfter,
          bet: { userAvatarUrl: bet.userAvatarUrl },
        } as BetPoint)
    ) ?? []
  )

  const creator = useUserById(contract.creatorId) ?? null

  const userBets = useBets({
    contractId: contract.id,
    userId: user?.id ?? '_',
    filterAntes: true,
  })

  const { isResolved, question, outcomeType } = contract

  const allowTrade = tradingAllowed(contract)

  const ogCardProps = getOpenGraphProps(contract)

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

  return (
    <Page
      rightSidebar={
        user || user === null ? (
          <>
            <ContractPageSidebar contract={contract} />
            {isCreator && (
              <Col className={'xl:hidden'}>
                <RecommendedContractsWidget contract={contract} />
              </Col>
            )}
          </>
        ) : (
          <div />
        )
      }
    >
      {ogCardProps && (
        <SEO
          title={question}
          description={ogCardProps.description}
          url={`/${contract.creatorUsername}/${contract.slug}`}
          ogCardProps={ogCardProps}
        />
      )}
      <Col className="w-full justify-between rounded bg-white py-6 pl-1 pr-2 sm:px-2 md:px-6 md:py-8">
        <ContractOverview
          contract={contract}
          bets={bets}
          betPoints={betPoints}
        />
        {creator?.fractionResolvedCorrectly != null &&
          creator.fractionResolvedCorrectly < BAD_CREATOR_THRESHOLD && (
            <div className="pt-2">
              <AlertBox
                title="Warning"
                text="This creator has a track record of resolving their markets incorrectly."
              />
            </div>
          )}

        <ContractDescription className="mt-6 mb-2 px-2" contract={contract} />

        {isCreator ? (
          <CreatorSharePanel contract={contract} />
        ) : (
          <Spacer h={4} />
        )}

        {outcomeType === 'NUMERIC' && (
          <AlertBox
            title="Warning"
            text="Distributional numeric markets were introduced as an experimental feature and are now deprecated."
          />
        )}

        {(outcomeType === 'FREE_RESPONSE' ||
          outcomeType === 'MULTIPLE_CHOICE') && (
          <>
            <Spacer h={4} />
            <AnswersPanel
              contract={contract}
              onAnswerCommentClick={onAnswerCommentClick}
            />
            <Spacer h={4} />
          </>
        )}

        {outcomeType === 'NUMERIC' && allowTrade && (
          <NumericBetPanel className="xl:hidden" contract={contract} />
        )}

        {isResolved && (
          <>
            <ContractLeaderboard
              topContractMetrics={topContractMetrics.filter(
                (metric) => metric.userUsername !== HOUSE_BOT_USERNAME
              )}
              contractId={contract.id}
              currentUser={user}
            />
            <Spacer h={12} />
          </>
        )}

        <BetsSummary
          className="mb-4 px-2"
          contract={contract}
          userBets={userBets}
        />

        <div ref={tabsContainerRef}>
          <ContractTabs
            totalPositions={totalPositions}
            contract={contract}
            bets={bets}
            totalBets={totalBets}
            userBets={userBets ?? []}
            comments={comments}
            userPositionsByOutcome={userPositionsByOutcome}
            answerResponse={answerResponse}
            onCancelAnswerResponse={onCancelAnswerResponse}
            blockedUserIds={blockedUserIds}
            activeIndex={activeTabIndex}
            setActiveIndex={setActiveTabIndex}
          />
        </div>
      </Col>
      {!isCreator && <RecommendedContractsWidget contract={contract} />}
      <Spacer className="xl:hidden" h={10} />
      <ScrollToTopButton className="fixed bottom-16 right-2 z-20 lg:bottom-2 xl:hidden" />
    </Page>
  )
}

function ContractPageSidebar(props: { contract: Contract }) {
  const { contract } = props
  const { creatorId, isResolved, outcomeType } = contract
  const user = useUser()
  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isNumeric = outcomeType === 'NUMERIC'
  const allowTrade = tradingAllowed(contract)
  const isAdmin = useAdmin()
  const allowResolve = !isResolved && (isCreator || isAdmin) && !!user

  const hasSidePanel =
    (isBinary || isNumeric || isPseudoNumeric) && (allowTrade || allowResolve)

  return hasSidePanel ? (
    <Col className="gap-4">
      {allowTrade &&
        (isNumeric ? (
          <NumericBetPanel className="hidden xl:flex" contract={contract} />
        ) : (
          <BetPanel
            className="hidden xl:flex"
            contract={contract as CPMMBinaryContract}
          />
        ))}
      {allowResolve &&
        (isNumeric || isPseudoNumeric ? (
          <NumericResolutionPanel
            isAdmin={isAdmin}
            creator={user}
            isCreator={isCreator}
            contract={contract}
          />
        ) : (
          <ResolutionPanel
            isAdmin={isAdmin}
            creator={user}
            isCreator={isCreator}
            contract={contract}
          />
        ))}
    </Col>
  ) : null
}

const RecommendedContractsWidget = memo(
  function RecommendedContractsWidget(props: { contract: Contract }) {
    const { contract } = props
    const user = useUser()
    const [recommendations, setRecommendations] = useState<Contract[]>([])
    useEffect(() => {
      if (user) {
        getRecommendedContracts(contract, user.id, 6).then(setRecommendations)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contract.id, user?.id])
    if (recommendations.length === 0) {
      return null
    }
    return (
      <Col className="mt-2 gap-2 px-2 sm:px-1">
        <Title className="text-gray-700" text="Related markets" />
        <ContractsGrid contracts={recommendations} trackingPostfix=" related" />
      </Col>
    )
  }
)
