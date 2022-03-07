export type LiquidityProvision = {
  id: string
  userId: string
  contractId: string

  createdTime: number
  isAnte?: boolean

  amount: number // M$ quantity
  liquidity: number // sqrt(k)
}
