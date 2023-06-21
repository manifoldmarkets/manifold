import type { JSONContent } from '@tiptap/core'
import { visibility } from './contract'

export type AnyCommentType = OnContract | OnPost

// Currently, comments are created after the bet, not atomically with the bet.
// They're uniquely identified by the pair contractId/betId.
export type Comment<T extends AnyCommentType = AnyCommentType> = {
  id: string
  replyToCommentId?: string
  userId: string

  /** @deprecated - content now stored as JSON in content*/
  text?: string
  content: JSONContent
  createdTime: number

  // Denormalized, for rendering comments
  userName: string
  userUsername: string
  userAvatarUrl?: string
  likes?: number

  hidden?: boolean
  hiddenTime?: number
  hiderId?: string
  visibility: visibility
  editedTime?: number
  isApi?: boolean
} & T

export type OnContract = {
  commentType: 'contract'
  contractId: string
  answerOutcome?: string // reply to answer.id
  betId?: string

  // denormalized from contract
  contractSlug: string
  contractQuestion: string

  // denormalized from bet
  betAmount?: number
  betOutcome?: string
  betAnswerId?: string

  // Used to respond to another user's bet
  bettorUsername?: string
  bettorName?: string

  // denormalized based on betting history
  commenterPositionProb?: number // binary only
  commenterPositionShares?: number
  commenterPositionOutcome?: string
  commenterPositionAnswerId?: string
}

export type OnPost = {
  commentType: 'post'
  postId: string
}

export type ContractComment = Comment<OnContract>
export type PostComment = Comment<OnPost>
