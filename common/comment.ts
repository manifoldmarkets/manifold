// Currently, comments are created after the bet, not atomically with the bet.
// They're uniquely identified by the pair contractId/betId.
export type Comment = {
  contractId: string
  betId: string
  text: string
  createdTime: number
  // Denormalized, for rendering comments
  userName?: string
  userUsername?: string
  userAvatarUrl?: string
}
