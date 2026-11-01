import { getDeterministicABTestVariant } from './ab-test'

export const BROWSE_EXPERIMENT = 'browse-redesign-v1'
export const BROWSE_EXPOSURE_EVENT = 'browse redesign exposure'
export const BROWSE_TOGGLE_EVENT = 'browse view toggle'
export const BROWSE_ENROLLMENT_KEY = `${BROWSE_EXPERIMENT}-enrollment`
export const BROWSE_CHOICE_KEY = 'browse-view'
export const DEVICE_HISTORY_KEY = 'device-first-seen-v1'

export type BrowseView = 'new' | 'legacy'
export type BrowseCohort =
  | 'new-visitor'
  | 'returning-visitor'
  | 'existing-user'
  | 'prior-choice'
  | 'unavailable'

// A browser-level experiment: existing device tokens have unknown first-visit
// dates and are conservatively treated as returning visitors. Clearing browser
// data cannot be distinguished from a genuinely new visitor.
export type DeviceHistory = {
  deviceId: string
  firstSeenTime: number | null
}

export type BrowseEnrollment = {
  experiment: typeof BROWSE_EXPERIMENT
  deviceId: string
  cohort: BrowseCohort
  variant: 'control' | 'treatment' | null
  enrolledAt: number
  signedInAtEnrollment: boolean
}

export const readBrowseView = (value: unknown): BrowseView | undefined =>
  value === 'new' || value === 'legacy' ? value : undefined

export const readDeviceHistory = (
  value: unknown,
  deviceId: string
): DeviceHistory | undefined => {
  const history = value as DeviceHistory | undefined
  return history &&
    history.deviceId === deviceId &&
    (history.firstSeenTime === null ||
      (Number.isFinite(history.firstSeenTime) && history.firstSeenTime > 0))
    ? history
    : undefined
}

export const readBrowseEnrollment = (
  value: unknown,
  deviceId: string
): BrowseEnrollment | undefined => {
  const enrollment = value as BrowseEnrollment | undefined
  if (
    !enrollment ||
    enrollment.experiment !== BROWSE_EXPERIMENT ||
    enrollment.deviceId !== deviceId ||
    typeof enrollment.signedInAtEnrollment !== 'boolean' ||
    !Number.isFinite(enrollment.enrolledAt) ||
    enrollment.enrolledAt <= 0
  )
    return undefined
  if (enrollment.cohort === 'new-visitor') {
    return enrollment.variant === 'control' ||
      enrollment.variant === 'treatment'
      ? enrollment
      : undefined
  }
  return enrollment.variant === null &&
    [
      'returning-visitor',
      'existing-user',
      'prior-choice',
      'unavailable',
    ].includes(enrollment.cohort)
    ? enrollment
    : undefined
}

export const isExistingBrowseUser = (
  history: DeviceHistory | undefined,
  user?: { initialDeviceToken?: string; isBot?: boolean }
) =>
  !!user &&
  (user.isBot === true ||
    !history?.firstSeenTime ||
    // Signup already records the browser token on the private profile. Match
    // that proof instead of comparing server/client clocks at signup.
    user.initialDeviceToken !== history.deviceId)

export const enrollBrowseVisitor = (args: {
  history?: DeviceHistory
  user?: { initialDeviceToken?: string; isBot?: boolean }
  priorChoice?: BrowseView
  now: number
}): BrowseEnrollment => {
  const { history, user, priorChoice, now } = args
  const cohort: BrowseCohort = !history
    ? 'unavailable'
    : priorChoice
    ? 'prior-choice'
    : isExistingBrowseUser(history, user)
    ? 'existing-user'
    : history.firstSeenTime === null
    ? 'returning-visitor'
    : 'new-visitor'
  return {
    experiment: BROWSE_EXPERIMENT,
    deviceId: history?.deviceId ?? '',
    cohort,
    variant:
      cohort === 'new-visitor'
        ? getDeterministicABTestVariant(
            BROWSE_EXPERIMENT,
            `device:${history!.deviceId}`,
            ['control', 'treatment'] as const
          )
        : null,
    enrolledAt: now,
    signedInAtEnrollment: !!user,
  }
}

export const getBrowseView = (args: {
  enrollment: BrowseEnrollment
  preference?: BrowseView
  existingUser: boolean
}): BrowseView => {
  const { enrollment, preference, existingUser } = args
  // A returning account signing in on a fresh browser keeps Classic. Retain
  // the original enrollment for intention-to-treat analysis, even after login
  // or a manual switch; never relabel switchers as voluntary beta participants.
  return (
    preference ??
    (!existingUser && enrollment.variant === 'treatment' ? 'new' : 'legacy')
  )
}
