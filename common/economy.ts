import { ENV_CONFIG } from './envs/constants'

const econ = ENV_CONFIG.economy

export const FIXED_ANTE = econ?.FIXED_ANTE ?? 50

export const STARTING_BALANCE = econ?.STARTING_BALANCE ?? 500
export const STARTING_BONUS = econ?.STARTING_BONUS ?? 500
// for sus users, i.e. multiple sign ups for same person
export const SUS_STARTING_BALANCE = econ?.SUS_STARTING_BALANCE ?? 10
export const REFERRAL_AMOUNT = econ?.REFERRAL_AMOUNT ?? 250

export const UNIQUE_BETTOR_BONUS_AMOUNT = econ?.UNIQUE_BETTOR_BONUS_AMOUNT ?? 10
export const BETTING_STREAK_BONUS_AMOUNT =
  econ?.BETTING_STREAK_BONUS_AMOUNT ?? 5
export const BETTING_STREAK_BONUS_MAX = econ?.BETTING_STREAK_BONUS_MAX ?? 25
export const BETTING_STREAK_RESET_HOUR = econ?.BETTING_STREAK_RESET_HOUR ?? 7
export const FREE_MARKETS_PER_USER_MAX = econ?.FREE_MARKETS_PER_USER_MAX ?? 5
export const COMMENT_BOUNTY_AMOUNT = econ?.COMMENT_BOUNTY_AMOUNT ?? 250

export const UNIQUE_BETTOR_LIQUIDITY = 20

export const MAX_TRADERS_FOR_BONUS = 100