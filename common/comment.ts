import type { JSONContent } from '@tiptap/core'

// Currently, comments are created after the bet, not atomically with the bet.
// They're uniquely identified by the pair contractId/betId.
export type Comment = {
  id: string
  commentType: 'contract' | 'group'

  contractId?: string
  groupId?: string
  betId?: string
  answerOutcome?: string
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
  contractSlug?: string
  contractQuestion?: string
}
