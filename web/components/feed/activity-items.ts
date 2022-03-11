import _ from 'lodash'

import { Answer } from '../../../common/answer'
import { Bet } from '../../../common/bet'
import { Comment } from '../../../common/comment'
import { Contract } from '../../../common/contract'
import { User } from '../../../common/user'
import { filterDefined } from '../../../common/util/array'
import { canAddComment, mapCommentsByBetId } from '../../lib/firebase/comments'
import { fromNow } from '../../lib/util/time'

export type ActivityItem = {
  id: string
  type:
    | 'bet'
    | 'comment'
    | 'start'
    | 'betgroup'
    | 'answergroup'
    | 'close'
    | 'resolve'
    | 'expand'
    | undefined
}

export type FeedAnswerGroupItem = ActivityItem & {
  type: 'answergroup'
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  answer: Answer
  user: User | null | undefined
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

// Group together bets that are:
// - Within `windowMs` of the first in the group
// - Do not have a comment
// - Were not created by this user or the contract creator
// Return a list of ActivityItems
function groupBets(
  bets: Bet[],
  comments: Comment[],
  windowMs: number,
  contract: Contract,
  userId?: string
) {
  const commentsMap = mapCommentsByBetId(comments)
  const items: any[] = []
  let group: Bet[] = []

  // Turn the current group into an ActivityItem
  function pushGroup() {
    if (group.length == 1) {
      items.push(toActivityItem(group[0], false))
    } else if (group.length > 1) {
      items.push({ type: 'betgroup', bets: [...group], id: group[0].id })
    }
    group = []
  }

  function toActivityItem(bet: Bet, isPublic: boolean) {
    const comment = commentsMap[bet.id]
    return comment ? toFeedComment(bet, comment) : toFeedBet(bet, contract)
  }

  for (const bet of bets) {
    const isCreator = userId === bet.userId || contract.creatorId === bet.userId

    if (commentsMap[bet.id] || isCreator) {
      pushGroup()
      // Create a single item for this
      items.push(toActivityItem(bet, true))
    } else {
      if (
        group.length > 0 &&
        bet.createdTime - group[0].createdTime > windowMs
      ) {
        // More than `windowMs` has passed; start a new group
        pushGroup()
      }
      group.push(bet)
    }
  }
  if (group.length > 0) {
    pushGroup()
  }
  return items as ActivityItem[]
}

function getAnswerGroups(
  contract: Contract,
  bets: Bet[],
  comments: Comment[],
  user: User | undefined | null
) {
  // Keep last two comments.
  comments = comments.slice(-2)
  const lastBet = bets[bets.length - 1]

  // Include up to 2 outcomes from comments and last bet.
  const outcomes = filterDefined(
    _.uniq([
      ...comments.map(
        (comment) => bets.find((bet) => bet.id === comment.betId)?.outcome
      ),
      lastBet?.outcome,
    ])
  ).slice(0, 2)

  // Keep bets on selected outcomes.
  bets = bets.filter((bet) => outcomes.includes(bet.outcome))

  const answerGroups = outcomes.map((outcome) => {
    const answerBets = bets.filter((bet) => bet.outcome === outcome)
    const answerComments = comments.filter((comment) =>
      answerBets.some((bet) => bet.id === comment.betId)
    )
    const answer = contract.answers?.find(
      (answer) => answer.id === outcome
    ) as Answer

    return {
      id: outcome,
      type: 'answergroup' as const,
      contract,
      answer,
      bets: answerBets,
      comments: answerComments,
      user,
    }
  })

  return answerGroups
}

function toFeedBet(bet: Bet, contract: Contract) {
  return {
    id: bet.id,
    contractId: bet.contractId,
    userId: bet.userId,
    type: 'bet',
    amount: bet.sale ? -bet.sale.amount : bet.amount,
    outcome: bet.outcome,
    createdTime: bet.createdTime,
    date: fromNow(bet.createdTime),
    contract,
  }
}

function toFeedComment(bet: Bet, comment: Comment) {
  return {
    id: bet.id,
    contractId: bet.contractId,
    userId: bet.userId,
    type: 'comment',
    amount: bet.sale ? -bet.sale.amount : bet.amount,
    outcome: bet.outcome,
    createdTime: bet.createdTime,
    date: fromNow(bet.createdTime),

    // Invariant: bet.comment exists
    text: comment.text,
    person: {
      username: comment.userUsername,
      name: comment.userName,
      avatarUrl: comment.userAvatarUrl,
    },
  }
}

export function getAllContractActivityItems(
  contract: Contract,
  bets: Bet[],
  comments: Comment[],
  user: User | null | undefined,
  outcome?: string
) {
  const { outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  bets = isBinary
    ? bets.filter((bet) => !bet.isAnte)
    : bets.filter((bet) => !(bet.isAnte && (bet.outcome as string) === '0'))

  if (outcome) {
    bets = bets.filter((bet) => bet.outcome === outcome)
  } else if (outcomeType === 'FREE_RESPONSE') {
    // Keep bets on comments or your bets where you can comment.
    const commentBetIds = new Set(comments.map((comment) => comment.betId))
    bets = bets.filter(
      (bet) =>
        commentBetIds.has(bet.id) ||
        canAddComment(bet.createdTime, user?.id === bet.userId)
    )
  }

  const items: ActivityItem[] = outcome ? [] : [{ type: 'start', id: '0' }]

  items.push(...groupBets(bets, comments, DAY_IN_MS, contract, user?.id))

  if (contract.closeTime && contract.closeTime <= Date.now()) {
    items.push({ type: 'close', id: `${contract.closeTime}` })
  }
  if (contract.resolution) {
    items.push({ type: 'resolve', id: `${contract.resolutionTime}` })
  }
  if (outcome) {
    // Hack to add some more padding above the 'multi' feedType, by adding a null item.
    items.unshift({ type: undefined, id: '-1' })
  }

  return items
}

export function getRecentContractActivityItems(
  contract: Contract,
  bets: Bet[],
  comments: Comment[],
  user: User | null | undefined
) {
  bets = bets.sort((b1, b2) => b1.createdTime - b2.createdTime)
  comments = comments.sort((c1, c2) => c1.createdTime - c2.createdTime)

  const items: ActivityItem[] = [{ type: 'start', id: '0' }]
  items.push(
    ...(contract.outcomeType === 'FREE_RESPONSE'
      ? getAnswerGroups(contract, bets, comments, user)
      : groupBets(bets, comments, DAY_IN_MS, contract, user?.id))
  )

  if (contract.closeTime && contract.closeTime <= Date.now()) {
    items.push({ type: 'close', id: `${contract.closeTime}` })
  }
  if (contract.resolution) {
    items.push({ type: 'resolve', id: `${contract.resolutionTime}` })
  }

  // Remove all but last bet group.
  const betGroups = items.filter((item) => item.type === 'betgroup')
  const lastBetGroup = betGroups[betGroups.length - 1]
  const filtered = items.filter(
    (item) => item.type !== 'betgroup' || item.id === lastBetGroup?.id
  )

  // Only show the first item plus the last three items.
  return filtered.length > 3 ? [filtered[0], ...filtered.slice(-3)] : filtered
}
