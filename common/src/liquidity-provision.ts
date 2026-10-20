export type LiquidityProvision = {
  id: string
  userId: string
  contractId: string
  createdTime: number
  isAnte?: boolean
  // WARNING: answerId is not properly set on most LP's. It is not set on initial MC LP's even if the
  // contract has multiple answers. Furthermore, it's only set on answers added after the question was created
  // (after this commit), and house subsidies.
  answerId?: string
  // On an independent multiple choice market, liquidity added to the whole
  // market (no answerId) is split equally among the answers open when it's
  // added, as each one's pending subsidy. These are those answers. Provisions
  // made before this was recorded don't have it.
  answerIds?: string[]
  amount: number // Ṁ quantity

  /** @deprecated change in constant k after provision*/
  liquidity?: number

  // For cpmm-1:
  pool?: { [outcome: string]: number } // pool shares before provision
}
