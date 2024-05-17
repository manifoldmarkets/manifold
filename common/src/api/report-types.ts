import type { JSONContent } from '@tiptap/core'

export type ReportStatus = 'new' | 'under review' | 'resolved' | 'needs admin'

export type Report = {
  report_id: number
  user_id: string
  contract_id: string
  comment_id: string
  status: ReportStatus
  created_time: string
  contract_slug: string
  contract_question: string
  content: JSONContent
  creator_username: string
}
