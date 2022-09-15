import { ENV_CONFIG } from './envs/constants'

const econ = ENV_CONFIG.economy

export const FIXED_ANTE = econ?.FIXED_ANTE ?? 100

export const STARTING_BALANCE = econ?.STARTING_BALANCE ?? 1000
// for sus users, i.e. multiple sign ups for same person
export const SUS_STARTING_BALANCE = econ?.SUS_STARTING_BALANCE ?? 10
export const REFERRAL_AMOUNT = econ?.REFERRAL_AMOUNT ?? 500

export const UNIQUE_BETTOR_BONUS_AMOUNT = econ?.UNIQUE_BETTOR_BONUS_AMOUNT ?? 10
export const BETTING_STREAK_BONUS_AMOUNT =
  econ?.BETTING_STREAK_BONUS_AMOUNT ?? 10
export const BETTING_STREAK_BONUS_MAX = econ?.BETTING_STREAK_BONUS_MAX ?? 50
export const BETTING_STREAK_RESET_HOUR = econ?.BETTING_STREAK_RESET_HOUR ?? 7
export const FREE_MARKETS_PER_USER_MAX = econ?.FREE_MARKETS_PER_USER_MAX ?? 5
