import { last, findLastIndex, uniq, sortBy } from 'lodash'

import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getOutcomeProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract, DPM, FreeResponse, FullContract } from 'common/contract'
import { User } from 'common/user'
import { mapCommentsByBetId } from 'web/lib/firebase/comments'

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
  | CommentThreadItem

type BaseActivityItem = {
  id: string
  contract: Contract
}

export type CommentInputItem = BaseActivityItem & {
  type: 'commentInput'
  betsByCurrentUser: Bet[]
  commentsByCurrentUser: Comment[]
  answerOutcome?: string
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
  hideComment?: boolean
}

export type CommentItem = BaseActivityItem & {
  type: 'comment'
  comment: Comment
  betsBySameUser: Bet[]
  probAtCreatedTime?: number
  truncate?: boolean
  smallAvatar?: boolean
}

export type CommentThreadItem = BaseActivityItem & {
  type: 'commentThread'
  parentComment: Comment
  comments: Comment[]
  bets: Bet[]
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
  betsByCurrentUser?: Bet[]
  commentsByCurrentUser?: Comment[]
}

export type CloseItem = BaseActivityItem & {
  type: 'close'
}

export type ResolveItem = BaseActivityItem & {
  type: 'resolve'
}

const DAY_IN_MS = 24 * 60 * 60 * 1000
const ABBREVIATED_NUM_COMMENTS_OR_BETS_TO_SHOW = 3

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
          betsBySameUser: [bet],
          contract,
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
  const abbrItems = abbreviated
    ? items.slice(-ABBREVIATED_NUM_COMMENTS_OR_BETS_TO_SHOW)
    : items
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

  let outcomes = uniq(bets.map((bet) => bet.outcome)).filter(
    (outcome) => getOutcomeProbability(contract, outcome) > 0.0001
  )
  if (abbreviated) {
    const lastComment = last(comments)
    const lastCommentOutcome = bets.find(
      (bet) => bet.id === lastComment?.betId
    )?.outcome
    const lastBetOutcome = last(bets)?.outcome
    if (lastCommentOutcome && lastBetOutcome) {
      outcomes = uniq([
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
    outcomes = sortBy(outcomes, (outcome) =>
      getOutcomeProbability(contract, outcome)
    )
  } else {
    // Sort by recent bet.
    outcomes = sortBy(outcomes, (outcome) =>
      findLastIndex(bets, (bet) => bet.outcome === outcome)
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

      if (abbreviated)
        items = items.slice(-ABBREVIATED_NUM_COMMENTS_OR_BETS_TO_SHOW)

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

  if (reversed) answerGroups.reverse()

  return answerGroups
}

function getAnswerAndCommentInputGroups(
  contract: FullContract<DPM, FreeResponse>,
  bets: Bet[],
  comments: Comment[],
  user: User | undefined | null
) {
  let outcomes = uniq(bets.map((bet) => bet.outcome)).filter(
    (outcome) => getOutcomeProbability(contract, outcome) > 0.0001
  )
  outcomes = sortBy(outcomes, (outcome) =>
    getOutcomeProbability(contract, outcome)
  )
  const betsByCurrentUser = bets.filter((bet) => bet.userId === user?.id)

  const answerGroups = outcomes
    .map((outcome) => {
      const answer = contract.answers?.find(
        (answer) => answer.id === outcome
      ) as Answer

      const answerBets = bets.filter((bet) => bet.outcome === outcome)
      const answerComments = comments.filter(
        (comment) =>
          comment.answerOutcome === outcome ||
          answerBets.some((bet) => bet.id === comment.betId)
      )
      const items = getCommentThreads(bets, answerComments, contract)

      return {
        id: outcome,
        type: 'answergroup' as const,
        contract,
        answer,
        items,
        user,
        betsByCurrentUser,
        commentsByCurrentUser: answerComments.filter(
          (comment) => comment.userId === user?.id
        ),
      }
    })
    .filter((group) => group.answer) as ActivityItem[]
  return answerGroups
}

function groupBetsAndComments(
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
  const { smallAvatar, abbreviated, reversed } = options
  // Comments in feed don't show user's position?
  const commentsWithoutBets = comments
    .filter((comment) => !comment.betId)
    .map((comment) => ({
      type: 'comment' as const,
      id: comment.id,
      contract: contract,
      comment,
      betsBySameUser: [],
      truncate: abbreviated,
      smallAvatar,
    }))

  const groupedBets = groupBets(bets, comments, contract, userId, options)

  // iterate through the bets and comment activity items and add them to the items in order of comment creation time:
  const unorderedBetsAndComments = [...commentsWithoutBets, ...groupedBets]
  const sortedBetsAndComments = sortBy(unorderedBetsAndComments, (item) => {
    if (item.type === 'comment') {
      return item.comment.createdTime
    } else if (item.type === 'bet') {
      return item.bet.createdTime
    } else if (item.type === 'betgroup') {
      return item.bets[0].createdTime
    }
  })

  const abbrItems = abbreviated
    ? sortedBetsAndComments.slice(-ABBREVIATED_NUM_COMMENTS_OR_BETS_TO_SHOW)
    : sortedBetsAndComments

  if (reversed) abbrItems.reverse()
  return abbrItems
}

function getCommentThreads(
  bets: Bet[],
  comments: Comment[],
  contract: Contract
) {
  const parentComments = comments.filter((comment) => !comment.replyToCommentId)

  const items = parentComments.map((comment) => ({
    type: 'commentThread' as const,
    id: comment.id,
    contract: contract,
    comments: comments,
    parentComment: comment,
    bets: bets,
  }))

  return items
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
  const reversed = true

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
    const onlyUsersBetsOrBetsWithComments = bets.filter((bet) =>
      comments.some(
        (comment) => comment.betId === bet.id || bet.userId === user?.id
      )
    )
    items.push(
      ...groupBetsAndComments(
        onlyUsersBetsOrBetsWithComments,
        comments,
        contract,
        user?.id,
        {
          hideOutcome: false,
          abbreviated,
          smallAvatar: false,
          reversed,
        }
      )
    )
    items.push({
      type: 'commentInput' as const,
      id: 'commentInput',
      contract,
      betsByCurrentUser: [],
      commentsByCurrentUser: [],
    })
  } else {
    items.push(
      ...groupBetsAndComments(bets, comments, contract, user?.id, {
        hideOutcome: false,
        abbreviated,
        smallAvatar: false,
        reversed,
      })
    )
  }

  if (contract.closeTime && contract.closeTime <= Date.now()) {
    items.push({ type: 'close', id: `${contract.closeTime}`, contract })
  }
  if (contract.resolution) {
    items.push({ type: 'resolve', id: `${contract.resolutionTime}`, contract })
  }

  if (outcomeType === 'BINARY') {
    items.push({
      type: 'commentInput' as const,
      id: 'commentInput',
      contract,
      betsByCurrentUser: [],
      commentsByCurrentUser: [],
    })
  }

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
  bets = bets.sort((b1, b2) => b1.createdTime - b2.createdTime)
  comments = comments.sort((c1, c2) => c1.createdTime - c2.createdTime)

  const questionItem: QuestionItem = {
    type: 'question',
    id: '0',
    contract,
    showDescription: false,
    contractPath,
  }

  const items = []
  if (contract.outcomeType === 'FREE_RESPONSE') {
    items.push(
      ...getAnswerGroups(
        contract as FullContract<DPM, FreeResponse>,
        bets,
        comments,
        user,
        {
          sortByProb: false,
          abbreviated: true,
          reversed: true,
        }
      )
    )
  } else {
    items.push(
      ...groupBetsAndComments(bets, comments, contract, user?.id, {
        hideOutcome: false,
        abbreviated: true,
        smallAvatar: false,
        reversed: true,
      })
    )
  }

  return [questionItem, ...items]
}

function commentIsGeneralComment(comment: Comment, contract: Contract) {
  return (
    comment.answerOutcome === undefined &&
    (contract.outcomeType === 'FREE_RESPONSE'
      ? comment.betId === undefined
      : true)
  )
}

export function getSpecificContractActivityItems(
  contract: Contract,
  bets: Bet[],
  comments: Comment[],
  user: User | null | undefined,
  options: {
    mode: 'comments' | 'bets' | 'free-response-comment-answer-groups'
  }
) {
  const { mode } = options
  const items = [] as ActivityItem[]

  switch (mode) {
    case 'bets':
      // Remove first bet (which is the ante):
      if (contract.outcomeType === 'FREE_RESPONSE') bets = bets.slice(1)
      items.push(
        ...bets.map((bet) => ({
          type: 'bet' as const,
          id: bet.id,
          bet,
          contract,
          hideOutcome: false,
          smallAvatar: false,
          hideComment: true,
        }))
      )
      break

    case 'comments': {
      const nonFreeResponseComments = comments.filter((comment) =>
        commentIsGeneralComment(comment, contract)
      )
      const nonFreeResponseBets =
        contract.outcomeType === 'FREE_RESPONSE' ? [] : bets
      items.push(
        ...getCommentThreads(
          nonFreeResponseBets,
          nonFreeResponseComments,
          contract
        )
      )

      items.push({
        type: 'commentInput',
        id: 'commentInput',
        contract,
        betsByCurrentUser: nonFreeResponseBets.filter(
          (bet) => bet.userId === user?.id
        ),
        commentsByCurrentUser: nonFreeResponseComments.filter(
          (comment) => comment.userId === user?.id
        ),
      })
      break
    }
    case 'free-response-comment-answer-groups':
      items.push(
        ...getAnswerAndCommentInputGroups(
          contract as FullContract<DPM, FreeResponse>,
          bets,
          comments,
          user
        )
      )
      break
  }

  return items.reverse()
}
