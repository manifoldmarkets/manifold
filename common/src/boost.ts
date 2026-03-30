import { type Contract } from './contract'

export const BOOST_CONTENT_TYPES = ['contract', 'post'] as const
export type BoostContentType = (typeof BOOST_CONTENT_TYPES)[number]

export const BOOST_PAYMENT_TYPES = ['free', 'mana', 'cash'] as const
export type BoostPaymentType = (typeof BOOST_PAYMENT_TYPES)[number]

export const BOOST_PAYMENT_TYPE = {
  FREE: 'free',
  MANA: 'mana',
  CASH: 'cash',
} as const satisfies Record<string, BoostPaymentType>

export const BOOST_PURCHASE_EVENT_NAMES: Record<BoostContentType, string> = {
  contract: 'contract boost purchased',
  post: 'post boost purchased',
}

export const BOOST_INITIATED_EVENT_NAMES: Record<BoostContentType, string> = {
  contract: 'contract boost initiated',
  post: 'post boost initiated',
}

export const BOOST_CONTRACT_SUBSIDY_MANA = 5000

export const contractBoostAddsSubsidy = (
  contract: Pick<Contract, 'mechanism'>
) =>
  contract.mechanism === 'cpmm-1' || contract.mechanism === 'cpmm-multi-1'
