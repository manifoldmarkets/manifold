import { uniq, sortBy } from 'lodash'

import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getOutcomeProbability } from 'common/calculate'
import { ContractComment } from 'common/comment'
import { Contract, FreeResponseContract } from 'common/contract'
import { User } from 'common/user'
import { CommentTipMap } from 'web/hooks/use-tip-txns'

export type ActivityItem =
  | DescriptionItem
  | QuestionItem
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
  commentsByCurrentUser: ContractComment[]
}

export type DescriptionItem = BaseActivityItem & {
  type: 'description'
}

export type QuestionItem = BaseActivityItem & {
  type: 'question'
  contractPath?: string
}

export type CommentThreadItem = BaseActivityItem & {
  type: 'commentThread'
  parentComment: ContractComment
  comments: ContractComment[]
  tips: CommentTipMap
  bets: Bet[]
}

export type AnswerGroupItem = BaseActivityItem & {
  type: 'answergroup'
  user: User | undefined | null
  answer: Answer
  comments: ContractComment[]
  tips: CommentTipMap
  bets: Bet[]
}

export type CloseItem = BaseActivityItem & {
  type: 'close'
}

export type ResolveItem = BaseActivityItem & {
  type: 'resolve'
}

function getAnswerAndCommentInputGroups(
  contract: FreeResponseContract,
  bets: Bet[],
  comments: ContractComment[],
  tips: CommentTipMap,
  user: User | undefined | null
) {
  let outcomes = uniq(bets.map((bet) => bet.outcome))
  outcomes = sortBy(outcomes, (outcome) =>
    getOutcomeProbability(contract, outcome)
  )

  const answerGroups = outcomes
    .map((outcome) => {
      const answer = contract.answers?.find(
        (answer) => answer.id === outcome
      ) as Answer

      return {
        id: outcome,
        type: 'answergroup' as const,
        contract,
        user,
        answer,
        comments,
        tips,
        bets,
      }
    })
    .filter((group) => group.answer) as ActivityItem[]
  return answerGroups
}

function getCommentThreads(
  bets: Bet[],
  comments: ContractComment[],
  tips: CommentTipMap,
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
    tips,
  }))

  return items
}

function commentIsGeneralComment(comment: ContractComment, contract: Contract) {
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
  comments: ContractComment[],
  tips: CommentTipMap,
  user: User | null | undefined,
  options: {
    mode: 'comments' | 'free-response-comment-answer-groups'
  }
) {
  const { mode } = options
  let items = [] as ActivityItem[]

  switch (mode) {
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
          tips,
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
          contract as FreeResponseContract,
          bets,
          comments,
          tips,
          user
        )
      )
      break
  }

  return items.reverse()
}
