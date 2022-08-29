import { JSONContent } from '@tiptap/core'

export type Post = {
  id: string
  name: string
  content: JSONContent
  creatorId: string // User id
  createdTime: number
  slug: string
}

export const MAX_POST_NAME_LENGTH = 480
