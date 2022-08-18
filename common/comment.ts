import type { JSONContent } from '@tiptap/core'

export type AnyCommentType = OnContract | OnGroup

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
} & T

type OnContract = {
  commentType: 'contract'
  contractId: string
  contractSlug: string
  contractQuestion: string
  answerOutcome?: string
  betId?: string
}

type OnGroup = {
  commentType: 'group'
  groupId: string
}

export type ContractComment = Comment<OnContract>
export type GroupComment = Comment<OnGroup>
