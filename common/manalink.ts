export type Manalink = {
  // The link to send: https://manifold.markets/send/{slug}
  // Also functions as the unique identifier for the link.
  slug: string

  // Note: we assume both fromId and toId are of SourceType 'USER'
  fromId: string

  // How much to send with the link
  amount: number
  token: 'M$' // TODO: could send eg YES shares too??

  createdTime: number
  // If not set, the link is valid forever
  expiresTime?: number
  // If not set, the link can be used infinitely
  maxUses?: number

  // All past usages of this link
  claims: Claim[]
}

type Claim = {
  toId: string

  claimedTime: number
}
