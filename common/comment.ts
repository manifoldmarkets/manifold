import type { JSONContent } from '@tiptap/core'

export type AnyCommentType = OnContract | OnGroup | OnPost

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
} & T

export type OnContract = {
  commentType: 'contract'
  contractId: string
  answerOutcome?: string
  betId?: string

  // denormalized from contract
  contractSlug: string
  contractQuestion: string

  // denormalized from bet
  betAmount?: number
  betOutcome?: string

  // denormalized based on betting history
  commenterPositionProb?: number // binary only
  commenterPositionShares?: number
  commenterPositionOutcome?: string
}

export type OnGroup = {
  commentType: 'group'
  groupId: string
}

export type OnPost = {
  commentType: 'post'
  postId: string
}

export type ContractComment = Comment<OnContract>
export type GroupComment = Comment<OnGroup>
export type PostComment = Comment<OnPost>
