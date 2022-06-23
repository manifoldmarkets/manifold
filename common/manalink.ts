export type Manalink = {
  // The link to send: https://manifold.markets/send/{slug}
  // Also functions as the unique id for the link.
  slug: string

  // Note: we assume both fromId and toId are of SourceType 'USER'
  fromId: string

  // Displayed to people claiming the link
  message: string

  // How much to send with the link
  amount: number
  token: 'M$' // TODO: could send eg YES shares too??

  createdTime: number
  // If null, the link is valid forever
  expiresTime: number | null
  // If null, the link can be used infinitely
  maxUses: number | null

  // Used for simpler caching
  claimedUserIds: string[]
  // Successful redemptions of the link
  claims: Claim[]
}

export type Claim = {
  toId: string

  // The ID of the successful txn that tracks the money moved
  txnId: string

  claimedTime: number
}
