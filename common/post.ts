import { JSONContent } from '@tiptap/core'

export type Post = {
  id: string
  title: string
  content: JSONContent
  creatorId: string // User id
  createdTime: number
  slug: string
}

export const MAX_POST_TITLE_LENGTH = 480
