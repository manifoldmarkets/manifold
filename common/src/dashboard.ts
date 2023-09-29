import { JSONContent } from '@tiptap/core'
import { Row, convertSQLtoTS, tsToMillis } from './supabase/utils'

export type Dashboard = {
  id: string
  slug: string
  creatorId: string
  createdTime: number
  description: JSONContent
  title: string
  items: DashboardItem[]
  creatorUsername: string
  creatorName: string
  creatorAvatarUrl: string
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

export const convertDashboardSqltoTS = (
  sqlDashboard: Row<'dashboards'>
): Dashboard => {
  return convertSQLtoTS<'dashboards', Dashboard>(sqlDashboard, {
    created_time: tsToMillis,
  })
}
