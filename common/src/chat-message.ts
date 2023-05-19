import { JSONContent } from '@tiptap/core'

export type ChatMessage = {
  id: string
  userId: string
  userAvatarUrl: string
  userUsername: string
  userName: string
  channelId: string
  content: JSONContent
  createdTime: number
}
