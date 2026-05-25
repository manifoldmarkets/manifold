import { DAY_MS, HOUR_MS } from './util/time'

// At most ~2 prompts per user per year. iOS additionally silently caps at
// ~3/365d at the OS level, so this is the binding constraint on Android and
// matches Apple's behavior on iOS.
export const STORE_REVIEW_COOLDOWN_MS = 180 * DAY_MS

export const STREAK_MILESTONES = [
  14, 30, 60, 100, 200, 365, 700, 1000,
] as const

// Threshold for the contract-page "you just won" trigger. Any positive M$25
// profit on a market resolved within the last 48 hours counts as a fresh win.
export const WIN_BET_MIN_PROFIT = 25
export const WIN_BET_RECENT_RESOLUTION_MS = 48 * HOUR_MS

// Suppress nudges within this window after we showed the user a push-permission
// modal, so the two prompts don't pile up. Short window — a few hours later
// the context has fully changed.
export const PUSH_MODAL_RECENT_MS = 2 * HOUR_MS

export type StoreReviewReason =
  | 'shop-order'
  | 'streak-milestone'
  | 'streak-bonus-modal'
  | 'win-bet'
  | 'notifications-resolution'
  | 'referral-bonus'
