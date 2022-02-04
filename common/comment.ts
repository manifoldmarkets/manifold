// Currently, comments are created after the bet, not atomically with the bet.
// They're uniquely identified by the pair contractId/betId.
export type Comment = {
  id: string
  contractId: string
  betId: string
  userId: string

  text: string
  createdTime: number

  // Denormalized, for rendering comments
  userName?: string
  userUsername?: string
  userAvatarUrl?: string
}
