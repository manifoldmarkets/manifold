import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeftIcon } from '@heroicons/react/outline'
import { keyBy, sortBy, groupBy, sumBy, mapValues } from 'lodash'

import { useContractWithPreload } from 'web/hooks/use-contract'
import { ContractOverview } from 'web/components/contract/contract-overview'
import { BetPanel } from 'web/components/bet-panel'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { Title } from 'web/components/title'
import { Spacer } from 'web/components/layout/spacer'
import { listUsers, User } from 'web/lib/firebase/users'
import {
  Contract,
  getContractFromSlug,
  tradingAllowed,
  getBinaryProbPercent,
} from 'web/lib/firebase/contracts'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/page'
import { Bet, listAllBets } from 'web/lib/firebase/bets'
import { Comment, listAllComments } from 'web/lib/firebase/comments'
import Custom404 from '../404'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { Leaderboard } from 'web/components/leaderboard'
import { resolvedPayout } from 'common/calculate'
import { formatMoney } from 'common/util/format'
import { useUserById } from 'web/hooks/use-users'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { FirstArgument } from 'common/util/types'
import {
  BinaryContract,
  DPM,
  FreeResponse,
  FullContract,
  NumericContract,
} from 'common/contract'
import { contractTextDetails } from 'web/components/contract/contract-details'
import { useWindowSize } from 'web/hooks/use-window-size'
import Confetti from 'react-confetti'
import { NumericBetPanel } from '../../components/numeric-bet-panel'
import { NumericResolutionPanel } from '../../components/numeric-resolution-panel'
import { FeedComment } from 'web/components/feed/feed-comments'
import { FeedBet } from 'web/components/feed/feed-bets'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { username, contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id

  const [bets, comments] = await Promise.all([
    contractId ? listAllBets(contractId) : [],
    contractId ? listAllComments(contractId) : [],
  ])

  return {
    props: {
      contract,
      username,
      slug: contractSlug,
      bets,
      comments,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: {
  contract: Contract | null
  username: string
  bets: Bet[]
  comments: Comment[]
  slug: string
  backToHome?: () => void
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    username: '',
    comments: [],
    bets: [],
    slug: '',
  }
  return <ContractPageContent {...props} />
}

export function ContractPageContent(props: FirstArgument<typeof ContractPage>) {
  const { backToHome } = props

  const user = useUser()
  const { width, height } = useWindowSize()

  const contract = useContractWithPreload(props.contract)
  const { bets, comments } = props
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const shouldSeeConfetti = !!(
      user &&
      contract &&
      contract.creatorId === user.id &&
      Date.now() - contract.createdTime < 10 * 1000
    )
    setShowConfetti(shouldSeeConfetti)
  }, [contract, user])

  const inIframe = useIsIframe()
  if (inIframe) {
    return <ContractEmbedPage {...props} />
  }

  // Sort for now to see if bug is fixed.
  comments.sort((c1, c2) => c1.createdTime - c2.createdTime)
  bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)

  if (!contract) {
    return <Custom404 />
  }

  const { creatorId, isResolved, question, outcomeType } = contract

  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'
  const isNumeric = outcomeType === 'NUMERIC'
  const allowTrade = tradingAllowed(contract)
  const allowResolve = !isResolved && isCreator && !!user
  const hasSidePanel = (isBinary || isNumeric) && (allowTrade || allowResolve)

  const ogCardProps = getOpenGraphProps(contract)

  const rightSidebar = hasSidePanel ? (
    <Col className="gap-4">
      {allowTrade &&
        (isNumeric ? (
          <NumericBetPanel
            className="hidden xl:flex"
            contract={contract as NumericContract}
          />
        ) : (
          <BetPanel className="hidden xl:flex" contract={contract} />
        ))}
      {allowResolve &&
        (isNumeric ? (
          <NumericResolutionPanel
            creator={user}
            contract={contract as NumericContract}
          />
        ) : (
          <ResolutionPanel
            creator={user}
            contract={contract as BinaryContract}
          />
        ))}
    </Col>
  ) : null

  return (
    <Page rightSidebar={rightSidebar}>
      {showConfetti && (
        <Confetti
          width={width ? width : 500}
          height={height ? height : 500}
          recycle={false}
          numberOfPieces={300}
        />
      )}

      {ogCardProps && (
        <SEO
          title={question}
          description={ogCardProps.description}
          url={`/${props.username}/${props.slug}`}
          ogCardProps={ogCardProps}
        />
      )}

      <Col className="w-full justify-between rounded border-0 border-gray-100 bg-white px-2 py-6 md:px-6 md:py-8">
        {backToHome && (
          <button
            className="btn btn-sm mb-4 items-center gap-2 self-start border-0 border-gray-700 bg-white normal-case text-gray-700 hover:bg-white hover:text-gray-700 lg:hidden"
            onClick={backToHome}
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
            Back
          </button>
        )}

        <ContractOverview
          contract={contract}
          bets={bets ?? []}
          comments={comments ?? []}
        />

        {outcomeType === 'FREE_RESPONSE' && (
          <>
            <Spacer h={4} />
            <AnswersPanel
              contract={contract as FullContract<DPM, FreeResponse>}
            />
            <Spacer h={4} />
          </>
        )}

        {isNumeric && (
          <NumericBetPanel
            className="sm:hidden"
            contract={contract as NumericContract}
          />
        )}

        {isResolved && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <ContractLeaderboard contract={contract} bets={bets} />
              <ContractTopTrades
                contract={contract}
                bets={bets}
                comments={comments}
              />
            </div>
            <Spacer h={12} />
          </>
        )}

        <ContractTabs
          contract={contract}
          user={user}
          bets={bets}
          comments={comments}
        />
      </Col>
    </Page>
  )
}

function ContractLeaderboard(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props
  const [users, setUsers] = useState<User[]>()

  const { userProfits, top5Ids } = useMemo(() => {
    // Create a map of userIds to total profits (including sales)
    const betsByUser = groupBy(bets, 'userId')
    const userProfits = mapValues(betsByUser, (bets) =>
      sumBy(bets, (bet) => resolvedPayout(contract, bet) - bet.amount)
    )
    // Find the 5 users with the most profits
    const top5Ids = Object.entries(userProfits)
      .sort(([_i1, p1], [_i2, p2]) => p2 - p1)
      .filter(([, p]) => p > 0)
      .slice(0, 5)
      .map(([id]) => id)
    return { userProfits, top5Ids }
  }, [contract, bets])

  useEffect(() => {
    console.log('foo')
    if (top5Ids.length > 0) {
      listUsers(top5Ids).then((users) => {
        const sortedUsers = sortBy(users, (user) => -userProfits[user.id])
        setUsers(sortedUsers)
      })
    }
  }, [userProfits, top5Ids])

  return users && users.length > 0 ? (
    <Leaderboard
      title="🏅 Top bettors"
      users={users || []}
      columns={[
        {
          header: 'Total profit',
          renderCell: (user) => formatMoney(userProfits[user.id] || 0),
        },
      ]}
      className="mt-12 max-w-sm"
    />
  ) : null
}

function ContractTopTrades(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
}) {
  const { contract, bets, comments } = props
  const commentsById = keyBy(comments, 'id')
  const betsById = keyBy(bets, 'id')

  // If 'id2' is the sale of 'id1', both are logged with (id2 - id1) of profit
  // Otherwise, we record the profit at resolution time
  const profitById: Record<string, number> = {}
  for (const bet of bets) {
    if (bet.sale) {
      const originalBet = betsById[bet.sale.betId]
      const profit = bet.sale.amount - originalBet.amount
      profitById[bet.id] = profit
      profitById[originalBet.id] = profit
    } else {
      profitById[bet.id] = resolvedPayout(contract, bet) - bet.amount
    }
  }

  // Now find the betId with the highest profit
  const topBetId = sortBy(bets, (b) => -profitById[b.id])[0]?.id
  const topBettor = useUserById(betsById[topBetId]?.userId)

  // And also the commentId of the comment with the highest profit
  const topCommentId = sortBy(
    comments,
    (c) => c.betId && -profitById[c.betId]
  )[0]?.id

  return (
    <div className="mt-12 max-w-sm">
      {topCommentId && profitById[topCommentId] > 0 && (
        <>
          <Title text="💬 Proven correct" className="!mt-0" />
          <div className="relative flex items-start space-x-3 rounded-md bg-gray-50 px-2 py-4">
            <FeedComment
              contract={contract}
              comment={commentsById[topCommentId]}
              betsBySameUser={[betsById[topCommentId]]}
              truncate={false}
              smallAvatar={false}
            />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {commentsById[topCommentId].userName} made{' '}
            {formatMoney(profitById[topCommentId] || 0)}!
          </div>
          <Spacer h={16} />
        </>
      )}

      {/* If they're the same, only show the comment; otherwise show both */}
      {topBettor && topBetId !== topCommentId && profitById[topBetId] > 0 && (
        <>
          <Title text="💸 Smartest money" className="!mt-0" />
          <div className="relative flex items-start space-x-3 rounded-md bg-gray-50 px-2 py-4">
            <FeedBet
              contract={contract}
              bet={betsById[topBetId]}
              hideOutcome={false}
              smallAvatar={false}
              bettor={topBettor}
            />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {topBettor?.name} made {formatMoney(profitById[topBetId] || 0)}!
          </div>
        </>
      )}
    </div>
  )
}

const getOpenGraphProps = (contract: Contract) => {
  const {
    resolution,
    question,
    creatorName,
    creatorUsername,
    outcomeType,
    creatorAvatarUrl,
  } = contract
  const probPercent =
    outcomeType === 'BINARY' ? getBinaryProbPercent(contract) : undefined

  const description = resolution
    ? `Resolved ${resolution}. ${contract.description}`
    : probPercent
    ? `${probPercent} chance. ${contract.description}`
    : contract.description

  return {
    question,
    probability: probPercent,
    metadata: contractTextDetails(contract),
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    description,
  }
}
