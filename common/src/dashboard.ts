import { JSONContent } from '@tiptap/core'

export type Dashboard = {
  id: string
  slug: string
  creator_id: string
  created_time: number
  views: number
  description: JSONContent
  title: string
}
