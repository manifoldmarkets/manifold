import { uniq, sortBy } from 'lodash'

import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getOutcomeProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract, FreeResponseContract } from 'common/contract'
import { User } from 'common/user'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { LiquidityProvision } from 'common/liquidity-provision'

export type ActivityItem =
  | DescriptionItem
  | QuestionItem
  | BetItem
  | AnswerGroupItem
  | CloseItem
  | ResolveItem
  | CommentInputItem
  | CommentThreadItem
  | LiquidityItem

type BaseActivityItem = {
  id: string
  contract: Contract
}

export type CommentInputItem = BaseActivityItem & {
  type: 'commentInput'
  betsByCurrentUser: Bet[]
  commentsByCurrentUser: Comment[]
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

export type CommentThreadItem = BaseActivityItem & {
  type: 'commentThread'
  parentComment: Comment
  comments: Comment[]
  tips: CommentTipMap
  bets: Bet[]
}

export type AnswerGroupItem = BaseActivityItem & {
  type: 'answergroup'
  user: User | undefined | null
  answer: Answer
  comments: Comment[]
  tips: CommentTipMap
  bets: Bet[]
}

export type CloseItem = BaseActivityItem & {
  type: 'close'
}

export type ResolveItem = BaseActivityItem & {
  type: 'resolve'
}

export type LiquidityItem = BaseActivityItem & {
  type: 'liquidity'
  liquidity: LiquidityProvision
  hideOutcome: boolean
  smallAvatar: boolean
  hideComment?: boolean
}

function getAnswerAndCommentInputGroups(
  contract: FreeResponseContract,
  bets: Bet[],
  comments: Comment[],
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
  comments: Comment[],
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
  liquidityProvisions: LiquidityProvision[],
  tips: CommentTipMap,
  user: User | null | undefined,
  options: {
    mode: 'comments' | 'bets' | 'free-response-comment-answer-groups'
  }
) {
  const { mode } = options
  let items = [] as ActivityItem[]

  switch (mode) {
    case 'bets':
      // Remove first bet (which is the ante):
      if (contract.outcomeType === 'FREE_RESPONSE') bets = bets.slice(1)
      items.push(
        ...bets.map((bet) => ({
          type: 'bet' as const,
          id: bet.id + '-' + bet.isSold,
          bet,
          contract,
          hideOutcome: false,
          smallAvatar: false,
          hideComment: true,
        }))
      )
      items.push(
        ...liquidityProvisions.map((liquidity) => ({
          type: 'liquidity' as const,
          id: liquidity.id,
          contract,
          liquidity,
          hideOutcome: false,
          smallAvatar: false,
        }))
      )
      items = sortBy(items, (item) =>
        item.type === 'bet'
          ? item.bet.createdTime
          : item.type === 'liquidity'
          ? item.liquidity.createdTime
          : undefined
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
