export type Message = {
  id: string
  userId: string
  text: string
  createdTime: number

  contractId?: string
  groupId?: string

  replyToMessageId?: string

  // Denormalized, for rendering messages
  userName: string
  userUsername: string
  userAvatarUrl?: string
}
