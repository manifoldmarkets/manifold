import { z } from 'zod'
import type { PerpContract } from '../contract'
import {
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeBps,
  getPerpTakerFeeImpact,
  PERP_TAKER_FEE_API_BPS_MAX,
  PERP_TAKER_FEE_IMPACT_MAX,
} from './fees'

// Shared by the API and dashboard; omitted fields are left unchanged.
export const perpConfigFields = z
  .object({
    maxLeverage: z.number().finite().gt(1).lte(100).optional(),
    maxFundingRate: z.number().finite().gt(0).lt(1).optional(),
    fundingSensitivity: z.number().finite().gt(0).lte(100).optional(),
    takerFeeBps: z.number().finite().min(0).max(100).optional(),
    takerFeeApiBps: z
      .number()
      .finite()
      .min(0)
      .max(PERP_TAKER_FEE_API_BPS_MAX)
      .optional(),
    takerFeeImpact: z
      .number()
      .finite()
      .min(0)
      .max(PERP_TAKER_FEE_IMPACT_MAX)
      .optional(),
    maxOraclePriceAgeMs: z.number().int().positive().optional(),
  })
  .strict()

export type PerpConfigPatch = z.infer<typeof perpConfigFields>
export const getPerpConfig = (contract: PerpContract) => ({
  maxLeverage: contract.maxLeverage,
  maxFundingRate: contract.maxFundingRate,
  fundingSensitivity: contract.fundingSensitivity,
  takerFeeBps: getPerpTakerFeeBps(contract),
  takerFeeApiBps: contract.takerFeeApiBps ?? 0,
  takerFeeImpact: getPerpTakerFeeImpact(contract),
  maxOraclePriceAgeMs: contract.maxOraclePriceAgeMs,
})

export type PerpDashboardMarket = {
  contract: PerpContract
  activeTraders: number
  openInterestLong: number
  openInterestShort: number
  volume24Hours: number
  fees24Hours: number
  minOraclePriceAgeMs: number
}
export type MnxDashboardMarket = PerpDashboardMarket

type AccountSummary = { id: string; username: string; balance: number }

export type MnxDashboard = {
  asOf: number
  account: AccountSummary | null
  payer: AccountSummary
  markets: PerpDashboardMarket[]
}

export type PerpsDashboardCreator = AccountSummary & {
  name: string
  // A registered perp creator account, so its balance may pay its own
  // markets' backing.
  canFund: boolean
}

// Every perp market, whoever created it, for the admin console.
export type PerpsDashboard = {
  asOf: number
  payer: AccountSummary
  creators: PerpsDashboardCreator[]
  markets: PerpDashboardMarket[]
}

export const getEffectiveApiFee = (contract: PerpContract) =>
  getPerpEffectiveTakerFeeBps(contract, true)
