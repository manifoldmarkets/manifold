import { JSONContent } from '@tiptap/core'
export type ChatVisibility = 'private' | 'system_status'

export type ChatMessage = {
  id: string
  userId: string
  channelId: string
  content: JSONContent
  createdTime: number
  visibility: ChatVisibility
}
