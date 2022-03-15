export type LiquidityProvision = {
  id: string
  userId: string
  contractId: string
  createdTime: number
  isAnte?: boolean

  amount: number // M$ quantity

  pool: { [outcome: string]: number } // pool shares before provision
  liquidity: number // change in constant k after provision
  p: number // p constant after provision
}
