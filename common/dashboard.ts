import { JSONContent } from '@tiptap/core'

export type Dashboard = {
  id: string
  name: string
  content: JSONContent
  creatorId: string // User id
  createdTime: number
  slug: string
}

export const MAX_DASHBOARD_NAME_LENGTH = 75
