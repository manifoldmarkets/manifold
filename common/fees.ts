export const PLATFORM_FEE = 0.005
export const CREATOR_FEE = 0.02
export const LIQUIDITY_FEE = 0.02

export const DPM_PLATFORM_FEE = 2 * PLATFORM_FEE
export const DPM_CREATOR_FEE = 2 * CREATOR_FEE
export const DPM_FEES = DPM_PLATFORM_FEE + DPM_CREATOR_FEE

export type Fees = {
  creatorFee: number
  platformFee: number
  liquidityFee: number
}

export const noFees: Fees = {
  creatorFee: 0,
  platformFee: 0,
  liquidityFee: 0,
}
