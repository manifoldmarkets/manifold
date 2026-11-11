import { getDeterministicABTestVariant } from './ab-test'

// A signed-out visitor who presses a bet button gets one of two things today.
// On a market page a trade ticket opens, with a second "Sign up to bet" button
// inside it. On a list row or card the sign-in window opens, and nothing
// follows it. This test opens sign-in on the first press everywhere, and
// reopens the chosen bet once the visitor is signed in.
export const SIGNED_OUT_BET_TEST = 'signed-out-bet-signin-v1'
export const SIGNED_OUT_BET_SIGN_IN_EVENT = 'signed out bet sign-in'
export const SIGNED_OUT_BET_RESUME_EVENT = 'signed out bet resumed'
// localStorage: 'control' or 'treatment' pins this browser, for QA.
export const SIGNED_OUT_BET_FORCE_KEY = `${SIGNED_OUT_BET_TEST}-force`
// localStorage: when this device first pressed a bet button signed out. Its
// exposure that time is the one the report enters it by.
export const SIGNED_OUT_BET_FIRST_PRESS_KEY = `${SIGNED_OUT_BET_TEST}-first-press`
export const PENDING_BET_KEY = 'pending-bet-v1'
// sessionStorage: sign-in has already been opened from a bet press in this tab.
export const SIGNED_OUT_BET_PROMPTED_KEY = 'signed-out-bet-prompted-v1'
// Long enough for the sign-in window and the welcome steps, short enough that
// a trade ticket never opens out of nowhere on a later visit.
export const PENDING_BET_TTL_MS = 10 * 60 * 1000

export const SIGNED_OUT_BET_VARIANTS = ['control', 'treatment'] as const
export type SignedOutBetVariant = (typeof SIGNED_OUT_BET_VARIANTS)[number]

// 'ticket': the press opens a trade ticket in place, which has its own sign-up
// button. 'button': the press can only ask for sign-in.
export type SignedOutBetSurface = 'ticket' | 'button'

// NEXT_PUBLIC_SIGNED_OUT_BET_SIGNIN. Unset runs the 50/50 test. 'off' is the
// kill switch: everyone keeps the old behaviour. 'on' gives everyone the new
// behaviour once the test has been read. Neither logs any of the test's events.
export type SignedOutBetMode = 'experiment' | 'off' | 'on'

export const readSignedOutBetMode = (configured?: string): SignedOutBetMode =>
  configured === 'off' || configured === 'on' ? configured : 'experiment'

export type SignedOutBetAssignment = {
  variant: SignedOutBetVariant
  // Counted in the test. False under 'off' and 'on', which assign nobody.
  enrolled: boolean
  // A QA override. Leave forced browsers out of effect estimates.
  forced: boolean
}

export const NO_SIGNED_OUT_BET_ASSIGNMENT: SignedOutBetAssignment = {
  variant: 'control',
  enrolled: false,
  forced: false,
}

export const getSignedOutBetAssignment = (args: {
  deviceToken: string
  mode: SignedOutBetMode
  forced?: unknown
}): SignedOutBetAssignment => {
  const { deviceToken, mode } = args
  if (mode === 'off') return NO_SIGNED_OUT_BET_ASSIGNMENT
  if (mode === 'on')
    return { variant: 'treatment', enrolled: false, forced: false }
  const forced = SIGNED_OUT_BET_VARIANTS.find((v) => v === args.forced)
  return {
    variant: getDeterministicABTestVariant(
      SIGNED_OUT_BET_TEST,
      `device:${deviceToken}`,
      SIGNED_OUT_BET_VARIANTS,
      forced
    ),
    enrolled: true,
    forced: forced !== undefined,
  }
}

export const getSignedOutBetPressPlan = (args: {
  variant: SignedOutBetVariant
  surface: SignedOutBetSurface
  // A bet press has already opened sign-in in this tab.
  alreadyPrompted: boolean
}) => {
  const { variant, surface, alreadyPrompted } = args
  return {
    // A button has nothing else to do, in either variant. A ticket asks once
    // per tab: someone who closed the window has said not now, and the
    // ticket's own button is still there.
    promptSignIn:
      surface === 'button' || (variant === 'treatment' && !alreadyPrompted),
    // A ticket stays open through sign-in. A button leaves nothing behind, so
    // its bet has to be remembered and reopened.
    rememberBet: variant === 'treatment' && surface === 'button',
  }
}

export type PendingBet = {
  contractId: string
  // Where the press happened, e.g. 'contract table'. The reopened ticket
  // reports the same location.
  location: string
  createdTime: number
  outcome?: 'YES' | 'NO'
  // The press was part of the test, so reopening its ticket is reported too.
  // Absent once the behaviour is rolled out to everyone.
  enrolled?: boolean
  forced?: boolean
}

const isOptionalBoolean = (value: unknown) =>
  value === undefined || typeof value === 'boolean'

export const readPendingBet = (
  value: unknown,
  now: number
): PendingBet | undefined => {
  const bet = value as Partial<PendingBet> | null | undefined
  if (
    !bet ||
    typeof bet !== 'object' ||
    typeof bet.contractId !== 'string' ||
    !bet.contractId ||
    typeof bet.location !== 'string' ||
    typeof bet.createdTime !== 'number' ||
    !Number.isFinite(bet.createdTime) ||
    (bet.outcome !== undefined &&
      bet.outcome !== 'YES' &&
      bet.outcome !== 'NO') ||
    !isOptionalBoolean(bet.enrolled) ||
    !isOptionalBoolean(bet.forced)
  )
    return undefined
  const age = now - bet.createdTime
  if (!(age >= 0 && age < PENDING_BET_TTL_MS)) return undefined
  const { contractId, location, createdTime, outcome, enrolled, forced } = bet
  return {
    contractId,
    location,
    createdTime,
    ...(outcome ? { outcome } : {}),
    ...(enrolled ? { enrolled, forced: !!forced } : {}),
  }
}

// The welcome steps only run on pages that mount them (Browse, Home, Feed).
// There, a reopened bet waits for them. Elsewhere nothing would ever finish
// them, so the bet opens straight away.
export const shouldWaitForWelcome = (args: {
  shouldShowWelcome: boolean | undefined
  welcomeMounted: boolean
  welcomeFinished: boolean
}) => !!args.shouldShowWelcome && args.welcomeMounted && !args.welcomeFinished
