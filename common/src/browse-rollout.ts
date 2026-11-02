import { getDeterministicABTestVariant } from './ab-test'

export const BROWSE_EXPERIMENT = 'browse-redesign-v2'
export const BROWSE_EXPOSURE_EVENT = 'browse redesign exposure'
export const BROWSE_TOGGLE_EVENT = 'browse view toggle'
export const BROWSE_ENROLLMENT_KEY = `${BROWSE_EXPERIMENT}-enrollment`
export const BROWSE_CHOICE_KEY = 'browse-view'
export const DEVICE_HISTORY_KEY = 'browse-first-seen-v2'
export const BROWSE_BROWSER_KEY = 'browse-browser-id-v2'

export type BrowseView = 'new' | 'legacy'
export type BrowseCohort =
  | 'new-visitor'
  | 'returning-visitor'
  | 'existing-user'
  | 'prior-choice'
  | 'unavailable'
  | 'not-started'

// A browser-level experiment: existing device tokens have unknown first-visit
// dates and are conservatively treated as returning visitors. Clearing browser
// data cannot be distinguished from a genuinely new visitor.
export type DeviceHistory = {
  browserId: string
  firstSeenTime: number | null
}

export type BrowseEnrollment = {
  experiment: typeof BROWSE_EXPERIMENT
  browserId: string
  cohort: BrowseCohort
  variant: 'control' | 'treatment' | null
  enrolledAt: number
  signedInAtEnrollment: boolean
}

export const readBrowseView = (value: unknown): BrowseView | undefined =>
  value === 'new' || value === 'legacy' ? value : undefined

export const readDeviceHistory = (
  value: unknown,
  browserId: string
): DeviceHistory | undefined => {
  const history = value as DeviceHistory | undefined
  return history &&
    history.browserId === browserId &&
    (history.firstSeenTime === null ||
      (Number.isFinite(history.firstSeenTime) && history.firstSeenTime > 0))
    ? history
    : undefined
}

export const readBrowseEnrollment = (
  value: unknown,
  browserId: string
): BrowseEnrollment | undefined => {
  const enrollment = value as BrowseEnrollment | undefined
  if (
    !enrollment ||
    enrollment.experiment !== BROWSE_EXPERIMENT ||
    enrollment.browserId !== browserId ||
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
      'not-started',
    ].includes(enrollment.cohort)
    ? enrollment
    : undefined
}

export const isExistingBrowseUser = (
  history: DeviceHistory | undefined,
  user?: { initialDeviceToken?: string; isBot?: boolean },
  deviceToken?: string
) =>
  !!user &&
  (user.isBot === true ||
    !history?.firstSeenTime ||
    // Signup already records the browser token on the private profile. Match
    // that proof instead of comparing server/client clocks at signup.
    !deviceToken ||
    user.initialDeviceToken !== deviceToken)

// Preview/local testing is independent of production. Production assignment
// requires an explicit UTC launch timestamp; unsetting it is the kill switch.
export const getBrowseExperimentStart = (
  hostname: string,
  configured?: string
) => {
  if (
    ['localhost', '127.0.0.1'].includes(hostname) ||
    hostname.endsWith('.vercel.app')
  )
    return 1
  const start =
    configured && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(configured)
      ? Date.parse(configured)
      : NaN
  return Number.isFinite(start) && start > 0 ? start : undefined
}

export const enrollBrowseVisitor = (args: {
  history?: DeviceHistory
  user?: { initialDeviceToken?: string; isBot?: boolean }
  priorChoice?: BrowseView
  deviceToken?: string
  experimentStart?: number
  now: number
}): BrowseEnrollment => {
  const { history, user, priorChoice, now, deviceToken, experimentStart } = args
  const cohort: BrowseCohort = !history
    ? 'unavailable'
    : priorChoice
    ? 'prior-choice'
    : isExistingBrowseUser(history, user, deviceToken)
    ? 'existing-user'
    : !experimentStart || now < experimentStart
    ? 'not-started'
    : history.firstSeenTime === null || history.firstSeenTime < experimentStart
    ? 'returning-visitor'
    : 'new-visitor'
  return {
    experiment: BROWSE_EXPERIMENT,
    browserId: history?.browserId ?? '',
    cohort,
    variant:
      cohort === 'new-visitor'
        ? getDeterministicABTestVariant(
            BROWSE_EXPERIMENT,
            `browser:${history!.browserId}`,
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
  experimentEnabled?: boolean
}): BrowseView => {
  const {
    enrollment,
    preference,
    existingUser,
    experimentEnabled = false,
  } = args
  // A returning account signing in on a fresh browser keeps Classic. Retain
  // the original enrollment for intention-to-treat analysis, even after login
  // or a manual switch; never relabel switchers as voluntary beta participants.
  return (
    preference ??
    (experimentEnabled && !existingUser && enrollment.variant === 'treatment'
      ? 'new'
      : 'legacy')
  )
}
