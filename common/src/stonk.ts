import { StonkContract } from 'common/contract'

export const STONK_YES = 'BUY'
export const STONK_NO = 'SHORT'
export const STONK_INITIAL_PROB = 50

const DEFAULT_STONK_MAX = 100
const DEFAULT_STONK_MIN = 0
export const getStonkPriceMax = (contract: StonkContract) => {
  //max is log scale of unique bettors
  const { uniqueBettorCount } = contract
  // unique counts to max price:
  // <35 = 100
  // <100 = 200
  // <250 = 300
  // <700 = 400
  // <2000 = 500
  const logCount = Math.log(uniqueBettorCount / 4.9)
  const growthScale =
    logCount * DEFAULT_STONK_MAX - ((logCount * DEFAULT_STONK_MAX) % 100)
  return growthScale > 100 ? growthScale : DEFAULT_STONK_MAX
}

export const getStonkPriceAtProb = (contract: StonkContract, prob: number) => {
  return (
    prob * (getStonkPriceMax(contract) - DEFAULT_STONK_MIN) + DEFAULT_STONK_MIN
  )
}

export const getStonkShares = (contract: StonkContract, shares: number) => {
  return Number(
    (Math.floor(shares) / getStonkPriceAtProb(contract, 1)).toFixed(2)
  )
}

export const getSharesFromStonkShares = (
  contract: StonkContract,
  shares: number
) => {
  return shares * getStonkPriceAtProb(contract, 1)
}
