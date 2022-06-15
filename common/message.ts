// Currently, comments are created after the bet, not atomically with the bet.
// They're uniquely identified by the pair contractId/betId.
export type Message = {
  id: string
  userId: string
  text: string
  createdTime: number

  contractId?: string
  groupId?: string

  replyToMessageId?: string

  // Denormalized, for rendering comments
  userName: string
  userUsername: string
  userAvatarUrl?: string
}
