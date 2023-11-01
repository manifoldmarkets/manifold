import { JSONContent } from '@tiptap/core'

export type ChatMessage = {
  id: string
  userId: string
  channelId: string
  content: JSONContent
  createdTime: number
  visibility: 'private' | 'system_status'
}
