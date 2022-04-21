import _ from 'lodash'

import { Answer } from '../../../common/answer'
import { Bet } from '../../../common/bet'
import { getOutcomeProbability } from '../../../common/calculate'
import { Comment } from '../../../common/comment'
import {
  Contract,
  DPM,
  FreeResponse,
  FullContract,
} from '../../../common/contract'
import { User } from '../../../common/user'
import { mapCommentsByBetId } from '../../lib/firebase/comments'

export type ActivityItem =
  | DescriptionItem
  | QuestionItem
  | BetItem
  | CommentItem
  | BetGroupItem
  | AnswerGroupItem
  | CloseItem
  | ResolveItem
  | CommentInputItem

type BaseActivityItem = {
  id: string
  contract: Contract
}

export type CommentInputItem = BaseActivityItem & {
  type: 'commentInput'
  bets: Bet[]
  commentsByBetId: Record<string, Comment>
}

export type DescriptionItem = BaseActivityItem & {
  type: 'description'
}

export type QuestionItem = BaseActivityItem & {
  type: 'question'
  showDescription: boolean
  contractPath?: string
}

export type BetItem = BaseActivityItem & {
  type: 'bet'
  bet: Bet
  hideOutcome: boolean
  smallAvatar: boolean
}

export type CommentItem = BaseActivityItem & {
  type: 'comment'
  comment: Comment
  bet: Bet | undefined
  hideOutcome: boolean
  truncate: boolean
  smallAvatar: boolean
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
// - Within a day of the first in the group
//  (Unless the bets are older: then are grouped by 7-days.)
// - Do not have a comment
// - Were not created by this user
// Return a list of ActivityItems
function groupBets(
  bets: Bet[],
  comments: Comment[],
  contract: Contract,
  userId: string | undefined,
  options: {
    hideOutcome: boolean
    abbreviated: boolean
    smallAvatar: boolean
    reversed: boolean
  }
) {
  const { hideOutcome, abbreviated, smallAvatar, reversed } = options

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

  function toActivityItem(bet: Bet): ActivityItem {
    const comment = commentsMap[bet.id]
    return comment
      ? {
          type: 'comment' as const,
          id: bet.id,
          comment,
          bet,
          contract,
          hideOutcome,
          truncate: abbreviated,
          smallAvatar,
        }
      : {
          type: 'bet' as const,
          id: bet.id,
          bet,
          contract,
          hideOutcome,
          smallAvatar,
        }
  }

  for (const bet of bets) {
    const isCreator = userId === bet.userId

    // If first bet in group is older than 3 days, group by 7 days. Otherwise, group by 1 day.
    const windowMs =
      Date.now() - (group[0]?.createdTime ?? bet.createdTime) > DAY_IN_MS * 3
        ? DAY_IN_MS * 7
        : DAY_IN_MS

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
  const abbrItems = abbreviated ? items.slice(-3) : items
  if (reversed) abbrItems.reverse()
  return abbrItems
}

function getAnswerGroups(
  contract: FullContract<DPM, FreeResponse>,
  bets: Bet[],
  comments: Comment[],
  user: User | undefined | null,
  options: {
    sortByProb: boolean
    abbreviated: boolean
    reversed: boolean
  }
) {
  const { sortByProb, abbreviated, reversed } = options

  let outcomes = _.uniq(bets.map((bet) => bet.outcome)).filter(
    (outcome) => getOutcomeProbability(contract, outcome) > 0.0001
  )
  if (abbreviated) {
    const lastComment = _.last(comments)
    const lastCommentOutcome = bets.find(
      (bet) => bet.id === lastComment?.betId
    )?.outcome
    const lastBetOutcome = _.last(bets)?.outcome
    if (lastCommentOutcome && lastBetOutcome) {
      outcomes = _.uniq([
        ...outcomes.filter(
          (outcome) =>
            outcome !== lastCommentOutcome && outcome !== lastBetOutcome
        ),
        lastCommentOutcome,
        lastBetOutcome,
      ])
    }
    outcomes = outcomes.slice(-2)
  }
  if (sortByProb) {
    outcomes = _.sortBy(outcomes, (outcome) =>
      getOutcomeProbability(contract, outcome)
    )
  } else {
    // Sort by recent bet.
    outcomes = _.sortBy(outcomes, (outcome) =>
      _.findLastIndex(bets, (bet) => bet.outcome === outcome)
    )
  }

  const answerGroups = outcomes
    .map((outcome) => {
      const answerBets = bets.filter((bet) => bet.outcome === outcome)
      const answerComments = comments.filter((comment) =>
        answerBets.some((bet) => bet.id === comment.betId)
      )
      const answer = contract.answers?.find(
        (answer) => answer.id === outcome
      ) as Answer

      let items = groupBets(answerBets, answerComments, contract, user?.id, {
        hideOutcome: true,
        abbreviated,
        smallAvatar: true,
        reversed,
      })

      if (abbreviated) items = items.slice(-2)

      return {
        id: outcome,
        type: 'answergroup' as const,
        contract,
        answer,
        items,
        user,
      }
    })
    .filter((group) => group.answer)

  return answerGroups
}

export function getAllContractActivityItems(
  contract: Contract,
  bets: Bet[],
  comments: Comment[],
  user: User | null | undefined,
  options: {
    abbreviated: boolean
  }
) {
  const { abbreviated } = options
  const { outcomeType } = contract

  const reversed = !abbreviated

  bets =
    outcomeType === 'BINARY'
      ? bets.filter((bet) => !bet.isAnte && !bet.isRedemption)
      : bets.filter((bet) => !(bet.isAnte && (bet.outcome as string) === '0'))

  const items: ActivityItem[] = abbreviated
    ? [
        {
          type: 'question',
          id: '0',
          contract,
          showDescription: false,
        },
      ]
    : [{ type: 'description', id: '0', contract }]

  if (outcomeType === 'FREE_RESPONSE') {
    items.push(
      ...getAnswerGroups(
        contract as FullContract<DPM, FreeResponse>,
        bets,
        comments,
        user,
        {
          sortByProb: true,
          abbreviated,
          reversed,
        }
      )
    )
  } else {
    const commentsWithoutBets = comments
      .filter((comment) => !comment.betId)
      .map((comment) => ({
        type: 'comment' as const,
        id: comment.id,
        contract: contract,
        comment,
        bet: undefined,
        truncate: false,
        hideOutcome: true,
        smallAvatar: false,
      }))

    const groupedBets = groupBets(bets, comments, contract, user?.id, {
      hideOutcome: false,
      abbreviated,
      smallAvatar: false,
      reversed: false,
    })

    // iterate through the bets and comment activity items and add them to the items in order of comment creation time:
    const unorderedBetsAndComments = [...commentsWithoutBets, ...groupedBets]
    const sortedBetsAndComments = _.sortBy(unorderedBetsAndComments, (item) => {
      if (item.type === 'comment') {
        return item.comment.createdTime
      } else if (item.type === 'bet') {
        return item.bet.createdTime
      } else if (item.type === 'betgroup') {
        return item.bets[0].createdTime
      }
    })
    items.push(...sortedBetsAndComments)
  }

  if (contract.closeTime && contract.closeTime <= Date.now()) {
    items.push({ type: 'close', id: `${contract.closeTime}`, contract })
  }
  if (contract.resolution) {
    items.push({ type: 'resolve', id: `${contract.resolutionTime}`, contract })
  }

  const commentsByBetId = mapCommentsByBetId(comments)
  items.push({
    type: 'commentInput',
    id: 'commentInput',
    bets,
    commentsByBetId,
    contract,
  })

  if (reversed) items.reverse()

  return items
}

export function getRecentContractActivityItems(
  contract: Contract,
  bets: Bet[],
  comments: Comment[],
  user: User | null | undefined,
  options: {
    contractPath?: string
  }
) {
  const { contractPath } = options
  bets = bets
    .filter((bet) => !bet.isRedemption)
    .sort((b1, b2) => b1.createdTime - b2.createdTime)
  comments = comments.sort((c1, c2) => c1.createdTime - c2.createdTime)

  const questionItem: QuestionItem = {
    type: 'question',
    id: '0',
    contract,
    showDescription: false,
    contractPath,
  }

  const items =
    contract.outcomeType === 'FREE_RESPONSE'
      ? getAnswerGroups(
          contract as FullContract<DPM, FreeResponse>,
          bets,
          comments,
          user,
          {
            sortByProb: false,
            abbreviated: true,
            reversed: false,
          }
        )
      : groupBets(bets, comments, contract, user?.id, {
          hideOutcome: false,
          abbreviated: true,
          smallAvatar: false,
          reversed: false,
        })

  return [questionItem, ...items]
}
