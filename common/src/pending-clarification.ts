import { JSONContent } from '@tiptap/core'

export type PendingClarification = {
  id: number
  contractId: string
  commentId: string
  createdTime: number
  data: {
    // The markdown text (used for display preview)
    markdown: string
    // The rich text content to append to description (used when applying)
    richText: JSONContent
  }
  appliedTime?: number
  cancelledTime?: number
}
