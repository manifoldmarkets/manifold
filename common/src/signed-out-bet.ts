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
// localStorage: when and where this device first pressed (see FirstPress).
export const SIGNED_OUT_BET_FIRST_PRESS_KEY = `${SIGNED_OUT_BET_TEST}-first-press`
// localStorage: exposures not yet known to be stored (see UnsentExposure).
export const SIGNED_OUT_BET_UNSENT_KEY = `${SIGNED_OUT_BET_TEST}-unsent`
// An exposure can enroll its device for this long after the device's first
// press. A device with nothing stored by then stays out of the test.
export const SIGNED_OUT_BET_ENROLLMENT_WINDOW_MS = 60 * 60 * 1000
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
export const SIGNED_OUT_BET_SURFACES = ['ticket', 'button'] as const
export type SignedOutBetSurface = (typeof SIGNED_OUT_BET_SURFACES)[number]

// Preview and localhost presses must never enter the production read.
export const SIGNED_OUT_BET_ENVIRONMENTS = [
  'production',
  'preview',
  'local',
] as const
export type SignedOutBetEnvironment =
  (typeof SIGNED_OUT_BET_ENVIRONMENTS)[number]

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

const isOptionalBoolean = (value: unknown) =>
  value === undefined || typeof value === 'boolean'

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const oneOf = <T extends string>(
  options: readonly T[],
  value: unknown
): T | undefined => options.find((option) => option === value)

// This device's first signed-out bet press: when, by its own clock, and on
// which surface. It is written once. `qa` records that the QA override has
// been used on this device, which keeps it out of the report from then on.
export type FirstPress = {
  time: number
  surface: SignedOutBetSurface
  qa?: boolean
}

export const readFirstPress = (value: unknown): FirstPress | undefined => {
  const press = asRecord(value)
  const surface = oneOf(SIGNED_OUT_BET_SURFACES, press?.surface)
  if (
    !press ||
    typeof press.time !== 'number' ||
    !Number.isFinite(press.time) ||
    press.time <= 0 ||
    !surface ||
    !isOptionalBoolean(press.qa)
  )
    return undefined
  return { time: press.time, surface, ...(press.qa ? { qa: true } : {}) }
}

// What every exposure says about its device's enrollment: where it first
// pressed, and how long ago. Elapsed time, not a clock reading, so a browser
// clock that is wrong makes no difference. The report takes a device's
// earliest exposure sent within an hour of its first press, places the
// device at the moment that exposure says the press happened, and counts
// from there. So a device enters once however many exposures it sends, and
// one that arrives late still counts from the press.
// Nothing is said if the record cannot be read or the clock has gone
// backwards. The report cannot place such a device and leaves it out.
export const getEnrollmentFields = (
  firstPress: FirstPress | undefined,
  now: number
) => {
  if (!firstPress) return {}
  const sinceFirstPressMs = now - firstPress.time
  return sinceFirstPressMs >= 0
    ? { firstSurface: firstPress.surface, sinceFirstPressMs }
    : {}
}

export type SignedOutBetExposure = {
  variant: SignedOutBetVariant
  // This press was pinned by the QA override, or the device has used it.
  forced: boolean
  location: string
  surface: SignedOutBetSurface
  contractId: string
  environment: SignedOutBetEnvironment
}

// An exposure that is not yet known to be stored. Events are stored
// best-effort, and a visitor who signs up straight after pressing never
// presses signed-out again. So an exposure is kept until it is stored, and
// sent again without waiting for another press.
export type UnsentExposure = {
  // Device, variant and QA override: one exposure per page load for each.
  key: string
  // When it was pressed, by the browser's clock.
  time: number
  exposure: SignedOutBetExposure
}

export const MAX_UNSENT_EXPOSURES = 5

const readExposure = (value: unknown): SignedOutBetExposure | undefined => {
  const exposure = asRecord(value)
  const variant = oneOf(SIGNED_OUT_BET_VARIANTS, exposure?.variant)
  const surface = oneOf(SIGNED_OUT_BET_SURFACES, exposure?.surface)
  const environment = oneOf(SIGNED_OUT_BET_ENVIRONMENTS, exposure?.environment)
  if (
    !exposure ||
    !variant ||
    !surface ||
    !environment ||
    typeof exposure.forced !== 'boolean' ||
    typeof exposure.location !== 'string' ||
    typeof exposure.contractId !== 'string'
  )
    return undefined
  const { forced, location, contractId } = exposure
  return { variant, forced, location, surface, contractId, environment }
}

// The exposures still worth sending. One pressed more than the enrollment
// window ago can no longer enroll its device, so it is dropped.
export const readUnsentExposures = (
  value: unknown,
  now: number
): UnsentExposure[] => {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((entry): UnsentExposure[] => {
      const item = asRecord(entry)
      const exposure = readExposure(item?.exposure)
      if (
        !item ||
        !exposure ||
        typeof item.key !== 'string' ||
        !item.key ||
        typeof item.time !== 'number'
      )
        return []
      const age = now - item.time
      return age >= 0 && age < SIGNED_OUT_BET_ENROLLMENT_WINDOW_MS
        ? [{ key: item.key, time: item.time, exposure }]
        : []
    })
    .slice(-MAX_UNSENT_EXPOSURES)
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
