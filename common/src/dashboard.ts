import { JSONContent } from '@tiptap/core'

export type Dashboard = {
  id: string
  slug: string
  creator_id: string
  created_time: number
  views: number
  description: JSONContent
  title: string
  items: DashboardItem[]
}

export type DashboardItem = DashboardQuestionItem | DashboardLinkItem

export type DashboardQuestionItem = {
  type: 'question'
  slug: string
}

export type DashboardLinkItem = {
  type: 'link'
  url: string
}
