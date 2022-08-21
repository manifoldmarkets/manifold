import { ENV_CONFIG } from './envs/constants'

export const STARTING_BALANCE = ENV_CONFIG.startingBalance ?? 1000
// for sus users, i.e. multiple sign ups for same person
export const SUS_STARTING_BALANCE = ENV_CONFIG.startingBalance ?? 10
export const REFERRAL_AMOUNT = ENV_CONFIG.referralBonus ?? 500

export const FIXED_ANTE = ENV_CONFIG.fixedAnte ?? 100

export const UNIQUE_BETTOR_BONUS_AMOUNT = 10
export const BETTING_STREAK_BONUS_AMOUNT = 5
export const BETTING_STREAK_BONUS_MAX = 100
export const BETTING_STREAK_RESET_HOUR = 0
