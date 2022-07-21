export type Challenge = {
  // The link to send: https://manifold.markets/challenges/username/market-slug/{slug}
  // Also functions as the unique id for the link.
  slug: string

  // The user that created the challenge.
  creatorId: string
  creatorUsername: string

  // Displayed to people claiming the challenge
  message: string

  // How much to put up
  creatorAmount: number

  // YES or NO for now
  creatorsOutcome: string

  // Different than the creator
  yourOutcome: string

  // The probability the challenger thinks
  creatorsOutcomeProb: number

  contractId: string
  contractSlug: string

  createdTime: number
  // If null, the link is valid forever
  expiresTime: number | null

  // How many times the challenge can be used
  maxUses: number

  // Used for simpler caching
  acceptedByUserIds: string[]
  // Successful redemptions of the link
  acceptances: Acceptance[]

  // TODO: will have to fill this on resolve contract
  isResolved: boolean
  resolutionOutcome?: string
}

export type Acceptance = {
  // User that accepted the challenge
  userId: string
  userUsername: string
  userName: string
  userAvatarUrl: string

  // The amount acceptor put up
  amount: number

  // The ID of the successful bet that tracks the money moved
  betId: string

  createdTime: number
}
