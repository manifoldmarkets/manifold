import { StonkContract } from 'common/contract'

export const STONK_YES = 'BUY'
export const STONK_NO = 'SHORT'
export const STONK_MAX = 100
export const STONK_MIN = 0
export const STONK_INITIAL_PROB = 50

export const getStonkPriceAtProb = (contract: StonkContract, prob: number) => {
  return prob * (STONK_MAX - STONK_MIN) + STONK_MIN
}

export const getStonkShares = (shares: number) => {
  return Number((Math.floor(shares) / STONK_MAX).toFixed(2))
}

export const getSharesFromStonkShares = (shares: number) => {
  return shares * STONK_MAX
}
