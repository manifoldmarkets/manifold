export type LiquidityProvision = {
  id: string
  userId: string
  contractId: string
  createdTime: number
  isAnte?: boolean

  amount: number // Ṁ quantity

  pool: { [outcome: string]: number } // pool shares before provision
  liquidity: number // change in constant k after provision
}
