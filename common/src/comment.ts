import { type JSONContent } from '@tiptap/core'
import { type ContractToken, type Visibility } from './contract'

export const MAX_COMMENT_LENGTH = 10000

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
  /** @deprecated Not actually deprecated, only in supabase column, and not in data column */
  likes?: number
  dislikes?: number
  hidden?: boolean
  hiddenTime?: number
  hiderId?: string
  pinned?: boolean
  pinnedTime?: number
  pinnerId?: string
  visibility: Visibility
  editedTime?: number
  isApi?: boolean
} & T

export type OnContract = {
  commentType: 'contract'
  contractId: string
  answerOutcome?: string // reply to answer.id
  betId?: string

  // denormalized from main contract
  contractSlug: string
  contractQuestion: string

  // denormalized from bet
  betAmount?: number
  betOutcome?: string
  betAnswerId?: string
  // denormalized from the contract you are betting on (may be cash)
  betToken?: ContractToken

  // Used to respond to another user's bet
  bettorUsername?: string
  bettorName?: string
  betLimitProb?: number
  betOrderAmount?: number
  bettorId?: string

  // denormalized based on betting history
  commenterPositionProb?: number // binary only
  commenterPositionShares?: number
  commenterPositionOutcome?: string
  commenterPositionAnswerId?: string

  bountyAwarded?: number
  betReplyAmountsByOutcome?: { [outcome: string]: number }

  isRepost?: boolean
}

export type ContractComment = Comment<OnContract>

export type CommentWithTotalReplies = ContractComment & {
  totalReplies?: number
}
export type OnPost = {
  commentType: 'post'
  postId: string
  postSlug?: string // only available via get-comments api
  postTitle?: string // only available via get-comments api
}
export type PostComment = Comment<OnPost>
