import _ from 'lodash'

import { Answer } from '../../../common/answer'
import { Bet } from '../../../common/bet'
import { Comment } from '../../../common/comment'
import { Contract } from '../../../common/contract'
import { User } from '../../../common/user'
import { filterDefined } from '../../../common/util/array'
import { canAddComment, mapCommentsByBetId } from '../../lib/firebase/comments'

export type ActivityItem =
  | DescriptionItem
  | QuestionItem
  | BetItem
  | CommentItem
  | CreateAnswerItem
  | BetGroupItem
  | AnswerGroupItem
  | CloseItem
  | ResolveItem

type BaseActivityItem = {
  id: string
  contract: Contract
}

export type DescriptionItem = BaseActivityItem & {
  type: 'description'
}

export type QuestionItem = BaseActivityItem & {
  type: 'question'
  showDescription: boolean
}

export type BetItem = BaseActivityItem & {
  type: 'bet'
  bet: Bet
  hideOutcome: boolean
}

export type CommentItem = BaseActivityItem & {
  type: 'comment'
  comment: Comment
  bet: Bet
  showOutcomeLabel: boolean
  truncate: boolean
}

export type CreateAnswerItem = BaseActivityItem & {
  type: 'createanswer'
  answer: Answer
}

export type BetGroupItem = BaseActivityItem & {
  type: 'betgroup'
  bets: Bet[]
  hideOutcome: boolean
}

export type AnswerGroupItem = BaseActivityItem & {
  type: 'answergroup'
  answer: Answer
  items: ActivityItem[]
}

export type CloseItem = BaseActivityItem & {
  type: 'close'
}

export type ResolveItem = BaseActivityItem & {
  type: 'resolve'
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
  userId: string | undefined,
  hideOutcome: boolean
) {
  const commentsMap = mapCommentsByBetId(comments)
  const items: ActivityItem[] = []
  let group: Bet[] = []

  // Turn the current group into an ActivityItem
  function pushGroup() {
    if (group.length == 1) {
      items.push(toActivityItem(group[0]))
    } else if (group.length > 1) {
      items.push({
        type: 'betgroup',
        bets: [...group],
        id: group[0].id,
        contract,
        hideOutcome,
      })
    }
    group = []
  }

  function toActivityItem(bet: Bet) {
    const comment = commentsMap[bet.id]
    return comment
      ? {
          type: 'comment' as const,
          id: bet.id,
          comment,
          bet,
          contract,
          showOutcomeLabel: !hideOutcome,
          truncate: true,
        }
      : { type: 'bet' as const, id: bet.id, bet, contract, hideOutcome }
  }

  for (const bet of bets) {
    const isCreator = userId === bet.userId || contract.creatorId === bet.userId

    if (commentsMap[bet.id] || isCreator) {
      pushGroup()
      // Create a single item for this
      items.push(toActivityItem(bet))
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
  return items
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

    const answerItems = groupBets(
      answerBets,
      answerComments,
      DAY_IN_MS,
      contract,
      user?.id,
      true
    )

    return {
      id: outcome,
      type: 'answergroup' as const,
      contract,
      answer,
      items: answerItems,
      user,
    }
  })

  return answerGroups
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

  let answer: Answer | undefined
  if (outcome) {
    bets = bets.filter((bet) => bet.outcome === outcome)
    answer = contract.answers?.find((answer) => answer.id === outcome)
  } else if (outcomeType === 'FREE_RESPONSE') {
    // Keep bets on comments or your bets where you can comment.
    const commentBetIds = new Set(comments.map((comment) => comment.betId))
    bets = bets.filter(
      (bet) =>
        commentBetIds.has(bet.id) ||
        canAddComment(bet.createdTime, user?.id === bet.userId)
    )
  }

  const items: ActivityItem[] =
    outcome && answer
      ? [{ type: 'createanswer', id: answer.id, contract, answer }]
      : [{ type: 'description', id: '0', contract }]

  items.push(
    ...groupBets(bets, comments, DAY_IN_MS, contract, user?.id, !!outcome)
  )

  if (contract.closeTime && contract.closeTime <= Date.now()) {
    items.push({ type: 'close', id: `${contract.closeTime}`, contract })
  }
  if (contract.resolution) {
    items.push({ type: 'resolve', id: `${contract.resolutionTime}`, contract })
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

  const items: ActivityItem[] =
    contract.outcomeType === 'FREE_RESPONSE'
      ? getAnswerGroups(contract, bets, comments, user)
      : groupBets(bets, comments, DAY_IN_MS, contract, user?.id, false)

  // Remove all but last bet group.
  const betGroups = items.filter((item) => item.type === 'betgroup')
  const lastBetGroup = betGroups[betGroups.length - 1]
  const filtered = items.filter(
    (item) => item.type !== 'betgroup' || item.id === lastBetGroup?.id
  )

  const questionItem: QuestionItem = {
    type: 'question',
    id: '0',
    contract,
    showDescription: false,
  }

  return [
    questionItem,
    // Only take the last three items.
    ...filtered.slice(-3),
  ]
}
