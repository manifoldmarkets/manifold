import React, { useEffect, useState } from 'react'

import { useContractWithPreload } from '../../hooks/use-contract'
import { ContractOverview } from '../../components/contract-overview'
import { BetPanel } from '../../components/bet-panel'
import { Col } from '../../components/layout/col'
import { useUser } from '../../hooks/use-user'
import { ResolutionPanel } from '../../components/resolution-panel'
import { ContractBetsTable, MyBetsSummary } from '../../components/bets-list'
import { useBets } from '../../hooks/use-bets'
import { Title } from '../../components/title'
import { Spacer } from '../../components/layout/spacer'
import { listUsers, User } from '../../lib/firebase/users'
import {
  Contract,
  getContractFromSlug,
  tradingAllowed,
  getBinaryProbPercent,
} from '../../lib/firebase/contracts'
import { SEO } from '../../components/SEO'
import { Page } from '../../components/page'
import { contractTextDetails } from '../../components/contract-card'
import { Bet, listAllBets } from '../../lib/firebase/bets'
import { Comment, listAllComments } from '../../lib/firebase/comments'
import Custom404 from '../404'
import { getFoldsByTags } from '../../lib/firebase/folds'
import { Fold } from '../../../common/fold'
import { useFoldsWithTags } from '../../hooks/use-fold'
import { listAllAnswers } from '../../lib/firebase/answers'
import { Answer } from '../../../common/answer'
import { AnswersPanel } from '../../components/answers/answers-panel'
import { fromPropz, usePropz } from '../../hooks/use-propz'
import { Leaderboard } from '../../components/leaderboard'
import _ from 'lodash'
import { calculatePayout, resolvedPayout } from '../../../common/calculate'
import { formatMoney } from '../../../common/util/format'
import { FeedBet, FeedComment } from '../../components/feed/feed-items'
import { useUserById } from '../../hooks/use-users'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { username, contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id

  const foldsPromise = getFoldsByTags(contract?.tags ?? [])

  const [bets, comments, answers] = await Promise.all([
    contractId ? listAllBets(contractId) : [],
    contractId ? listAllComments(contractId) : [],
    contractId && contract.outcomeType === 'FREE_RESPONSE'
      ? listAllAnswers(contractId)
      : [],
  ])

  const folds = await foldsPromise

  return {
    props: {
      contract,
      username,
      slug: contractSlug,
      bets,
      comments,
      answers,
      folds,
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
  answers: Answer[]
  slug: string
  folds: Fold[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    username: '',
    comments: [],
    answers: [],
    bets: [],
    slug: '',
    folds: [],
  }
  const user = useUser()

  const contract = useContractWithPreload(props.slug, props.contract)
  const { bets, comments } = props

  // Sort for now to see if bug is fixed.
  comments.sort((c1, c2) => c1.createdTime - c2.createdTime)
  bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)

  const folds = (useFoldsWithTags(contract?.tags) ?? props.folds).filter(
    (fold) => fold.followCount > 1 || user?.id === fold.curatorId
  )

  if (!contract) {
    return <Custom404 />
  }

  const { creatorId, isResolved, question, outcomeType } = contract

  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'
  const allowTrade = tradingAllowed(contract)
  const allowResolve = !isResolved && isCreator && !!user
  const hasSidePanel = isBinary && (allowTrade || allowResolve)

  const ogCardProps = getOpenGraphProps(contract)

  return (
    <Page wide={hasSidePanel}>
      {ogCardProps && (
        <SEO
          title={question}
          description={ogCardProps.description}
          url={`/${props.username}/${props.slug}`}
          ogCardProps={ogCardProps}
        />
      )}

      <Col className="w-full justify-between md:flex-row">
        <div className="flex-1 rounded border-0 border-gray-100 bg-white px-2 py-6 md:px-6 md:py-8">
          <ContractOverview
            contract={contract}
            bets={bets ?? []}
            comments={comments ?? []}
            folds={folds}
          >
            {contract.outcomeType === 'FREE_RESPONSE' && (
              <>
                <Spacer h={4} />
                <AnswersPanel
                  contract={contract as any}
                  answers={props.answers}
                />
                <Spacer h={4} />
                <div className="divider before:bg-gray-300 after:bg-gray-300" />
              </>
            )}
          </ContractOverview>

          {contract.isResolved && (
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
          <BetsSection contract={contract} user={user ?? null} bets={bets} />
        </div>

        {hasSidePanel && (
          <>
            <div className="md:ml-6" />

            <Col className="flex-shrink-0 md:w-[310px]">
              {allowTrade && (
                <BetPanel className="hidden lg:flex" contract={contract} />
              )}
              {allowResolve && (
                <ResolutionPanel creator={user} contract={contract} />
              )}
            </Col>
          </>
        )}
      </Col>
    </Page>
  )
}

function BetsSection(props: {
  contract: Contract
  user: User | null
  bets: Bet[]
}) {
  const { contract, user } = props
  const bets = useBets(contract.id) ?? props.bets

  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)

  const userBets = user && bets.filter((bet) => bet.userId === user.id)

  if (!userBets || userBets.length === 0) return <></>

  return (
    <div>
      <Title className="px-2" text="Your trades" />
      <MyBetsSummary className="px-2" contract={contract} bets={userBets} />
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets} />
      <Spacer h={12} />
    </div>
  )
}

function ContractLeaderboard(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props
  const [users, setUsers] = useState<User[]>()

  // Create a map of userIds to total profits (including sales)
  const betsByUser = _.groupBy(bets, 'userId')
  const userProfits = _.mapValues(betsByUser, (bets) =>
    _.sumBy(bets, (bet) => resolvedPayout(contract, bet) - bet.amount)
  )

  // Find the 5 users with the most profits
  const top5Ids = _.entries(userProfits)
    .sort(([i1, p1], [i2, p2]) => p2 - p1)
    .filter(([, p]) => p > 0)
    .slice(0, 5)
    .map(([id]) => id)

  useEffect(() => {
    if (top5Ids.length > 0) {
      listUsers(top5Ids).then((users) => {
        const sortedUsers = _.sortBy(users, (user) => -userProfits[user.id])
        setUsers(sortedUsers)
      })
    }
  }, [])

  return users && users.length > 0 ? (
    <Leaderboard
      title="🏅 Top traders"
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
  const commentsById = _.keyBy(comments, 'id')
  const betsById = _.keyBy(bets, 'id')

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
  const topBetId = _.sortBy(bets, (b) => -profitById[b.id])[0]?.id
  const topBettor = useUserById(betsById[topBetId]?.userId)

  // And also the commentId of the comment with the highest profit
  const topCommentId = _.sortBy(comments, (c) => -profitById[c.betId])[0]?.id

  return (
    <div className="mt-12 max-w-sm">
      {topCommentId && (
        <>
          <Title text="💬 Proven correct" className="!mt-0" />
          <div className="relative flex items-start space-x-3 rounded-md bg-gray-50 px-2 py-4">
            <FeedComment
              contract={contract}
              comment={commentsById[topCommentId]}
              bet={betsById[topCommentId]}
              hideOutcome={false}
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
      {topBettor && topBetId !== topCommentId && (
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
  const { resolution, question, creatorName, creatorUsername, outcomeType } =
    contract
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
    creatorName: creatorName,
    creatorUsername: creatorUsername,
    description,
  }
}
