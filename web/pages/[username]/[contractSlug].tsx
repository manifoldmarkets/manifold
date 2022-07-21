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
import { useUserById } from 'web/hooks/use-user'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { contractTextDetails } from 'web/components/contract/contract-details'
import { useWindowSize } from 'web/hooks/use-window-size'
import Confetti from 'react-confetti'
import { NumericBetPanel } from '../../components/numeric-bet-panel'
import { NumericResolutionPanel } from '../../components/numeric-resolution-panel'
import { FeedComment } from 'web/components/feed/feed-comments'
import { FeedBet } from 'web/components/feed/feed-bets'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'
import { useBets } from 'web/hooks/use-bets'
import { CPMMBinaryContract } from 'common/contract'
import { AlertBox } from 'web/components/alert-box'
import { useTracking } from 'web/hooks/use-tracking'
import { CommentTipMap, useTipTxns } from 'web/hooks/use-tip-txns'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { richTextToString } from 'common/util/parse'
import { useSaveReferral } from 'web/hooks/use-save-referral'

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
      // Limit the data sent to the client. Client will still load all bets and comments directly.
      bets: bets.slice(0, 5000),
      comments: comments.slice(0, 1000),
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

  const inIframe = useIsIframe()
  if (inIframe) {
    return <ContractEmbedPage {...props} />
  }

  const { contract } = props

  if (!contract) {
    return <Custom404 />
  }

  return <ContractPageContent {...{ ...props, contract }} />
}

export function ContractPageContent(
  props: Parameters<typeof ContractPage>[0] & { contract: Contract }
) {
  const { backToHome, comments } = props

  const contract = useContractWithPreload(props.contract) ?? props.contract

  useTracking('view market', {
    slug: contract.slug,
    contractId: contract.id,
    creatorId: contract.creatorId,
  })

  const bets = useBets(contract.id) ?? props.bets
  const liquidityProvisions =
    useLiquidity(contract.id)?.filter((l) => !l.isAnte && l.amount > 0) ?? []
  // Sort for now to see if bug is fixed.
  comments.sort((c1, c2) => c1.createdTime - c2.createdTime)

  const tips = useTipTxns({ contractId: contract.id })

  const user = useUser()

  const { width, height } = useWindowSize()

  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const shouldSeeConfetti = !!(
      user &&
      contract.creatorId === user.id &&
      Date.now() - contract.createdTime < 10 * 1000
    )
    setShowConfetti(shouldSeeConfetti)
  }, [contract, user])

  const { creatorId, isResolved, question, outcomeType } = contract

  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isNumeric = outcomeType === 'NUMERIC'
  const allowTrade = tradingAllowed(contract)
  const allowResolve = !isResolved && isCreator && !!user
  const hasSidePanel =
    (isBinary || isNumeric || isPseudoNumeric) && (allowTrade || allowResolve)

  const ogCardProps = getOpenGraphProps(contract)

  useSaveReferral(user, {
    defaultReferrer: contract.creatorUsername,
    contractId: contract.id,
  })

  const rightSidebar = hasSidePanel ? (
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
          <NumericResolutionPanel creator={user} contract={contract} />
        ) : (
          <ResolutionPanel creator={user} contract={contract} />
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

      <Col className="w-full justify-between rounded border-0 border-gray-100 bg-white py-6 pl-1 pr-2 sm:px-2 md:px-6 md:py-8">
        {backToHome && (
          <button
            className="btn btn-sm mb-4 items-center gap-2 self-start border-0 border-gray-700 bg-white normal-case text-gray-700 hover:bg-white hover:text-gray-700 lg:hidden"
            onClick={backToHome}
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
            Back
          </button>
        )}

        <ContractOverview contract={contract} bets={bets} />

        {isNumeric && (
          <AlertBox
            title="Warning"
            text="Distributional numeric markets were introduced as an experimental feature and are now deprecated."
          />
        )}

        {outcomeType === 'FREE_RESPONSE' && (
          <>
            <Spacer h={4} />
            <AnswersPanel contract={contract} />
            <Spacer h={4} />
          </>
        )}

        {isNumeric && allowTrade && (
          <NumericBetPanel className="xl:hidden" contract={contract} />
        )}

        {isResolved && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <ContractLeaderboard contract={contract} bets={bets} />
              <ContractTopTrades
                contract={contract}
                bets={bets}
                comments={comments}
                tips={tips}
              />
            </div>
            <Spacer h={12} />
          </>
        )}

        <ContractTabs
          contract={contract}
          user={user}
          liquidityProvisions={liquidityProvisions}
          bets={bets}
          tips={tips}
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
    const openBets = bets.filter((bet) => !bet.isSold && !bet.sale)
    const betsByUser = groupBy(openBets, 'userId')

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
  tips: CommentTipMap
}) {
  const { contract, bets, comments, tips } = props
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
              tips={tips[topCommentId]}
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
    description: desc,
  } = contract
  const probPercent =
    outcomeType === 'BINARY' ? getBinaryProbPercent(contract) : undefined

  const stringDesc = typeof desc === 'string' ? desc : richTextToString(desc)

  const description = resolution
    ? `Resolved ${resolution}. ${stringDesc}`
    : probPercent
    ? `${probPercent} chance. ${stringDesc}`
    : stringDesc

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
