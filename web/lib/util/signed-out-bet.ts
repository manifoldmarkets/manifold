import {
  FirstPress,
  getEnrollmentFields,
  getSignedOutBetAssignment,
  getSignedOutBetPressPlan,
  MAX_UNSENT_EXPOSURES,
  NO_SIGNED_OUT_BET_ASSIGNMENT,
  PENDING_BET_KEY,
  PendingBet,
  readFirstPress,
  readPendingBet,
  readSignedOutBetMode,
  readUnsentExposures,
  SIGNED_OUT_BET_FIRST_PRESS_KEY,
  SIGNED_OUT_BET_FORCE_KEY,
  SIGNED_OUT_BET_PROMPTED_KEY,
  SIGNED_OUT_BET_SIGN_IN_EVENT,
  SIGNED_OUT_BET_TEST,
  SIGNED_OUT_BET_UNSENT_KEY,
  SignedOutBetAssignment,
  SignedOutBetEnvironment,
  SignedOutBetSurface,
  UnsentExposure,
} from 'common/signed-out-bet'
import { safeJsonParse } from 'common/util/json'

import { firebaseLogin } from 'web/lib/firebase/users'
import { getIsNative } from 'web/lib/native/is-native'
import { track } from 'web/lib/service/analytics'
import { ensureDeviceToken } from 'web/lib/util/device-token'
import { safeLocalStorage, safeSessionStorage } from 'web/lib/util/local'

export type SignedOutBetPress = {
  contractId: string
  // The same location the button reports in its 'bet intent' event.
  location: string
  surface: SignedOutBetSurface
  outcome?: 'YES' | 'NO'
}

// Module state lasts for one page load, like the exposure cache in
// use-ab-test.ts. The pending bet and the "already asked" mark are also kept
// in sessionStorage, so they last for the tab and survive a reload.
// Exposures this page load has already made. Keyed by device, variant and QA
// override, so a QA override switched on mid-page makes one of its own.
const exposures = new Set<string>()
// Exposures with a request on its way.
const sending = new Set<string>()
// After a failed store: wait this long and try again, without a press.
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000]
let retries = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let promptedThisPage = false
// Whatever sessionStorage held; readPendingBet decides whether it is usable.
let pendingBet: unknown
let pendingBetLoaded = false
let welcomeMounts = 0
let welcomeFinishedFor: string | undefined
let version = 0
const listeners = new Set<() => void>()

const changed = () => {
  version++
  listeners.forEach((listener) => listener())
}

export const subscribeSignedOutBet = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getSignedOutBetVersion = () => version

const getMode = () =>
  readSignedOutBetMode(process.env.NEXT_PUBLIC_SIGNED_OUT_BET_SIGNIN)

const getAssignment = (): SignedOutBetAssignment => {
  // The native app signs in on its own screen. Without storage a browser gets
  // a new device token for every event, so it has no stable variant.
  if (getIsNative() || !safeLocalStorage) return NO_SIGNED_OUT_BET_ASSIGNMENT
  return getSignedOutBetAssignment({
    deviceToken: ensureDeviceToken(),
    mode: getMode(),
    forced: safeLocalStorage.getItem(SIGNED_OUT_BET_FORCE_KEY),
  })
}

const getEnvironment = (): SignedOutBetEnvironment => {
  const { hostname } = window.location
  return ['manifold.markets', 'www.manifold.markets'].includes(hostname)
    ? 'production'
    : ['localhost', '127.0.0.1'].includes(hostname)
    ? 'local'
    : 'preview'
}

const getFirstPress = () =>
  readFirstPress(
    safeJsonParse(safeLocalStorage?.getItem(SIGNED_OUT_BET_FIRST_PRESS_KEY))
  )

const setFirstPress = (press: FirstPress) =>
  safeLocalStorage?.setItem(
    SIGNED_OUT_BET_FIRST_PRESS_KEY,
    JSON.stringify(press)
  )

// Record this device's first press if it has never pressed, and that the QA
// override has been used here if it has. A record that is there but cannot
// be read is left as it is. The device then says nothing about when it
// began and stays out of the test, which is safer than starting it over.
const noteFirstPress = (surface: SignedOutBetSurface, forced: boolean) => {
  if (safeLocalStorage?.getItem(SIGNED_OUT_BET_FIRST_PRESS_KEY) == null) {
    setFirstPress({
      time: Date.now(),
      surface,
      ...(forced ? { qa: true } : {}),
    })
    return
  }
  const press = getFirstPress()
  if (press && forced && !press.qa) setFirstPress({ ...press, qa: true })
}

const getUnsent = () =>
  readUnsentExposures(
    safeJsonParse(safeLocalStorage?.getItem(SIGNED_OUT_BET_UNSENT_KEY)),
    Date.now()
  )

const setUnsent = (unsent: UnsentExposure[]) => {
  if (unsent.length)
    safeLocalStorage?.setItem(
      SIGNED_OUT_BET_UNSENT_KEY,
      JSON.stringify(unsent.slice(-MAX_UNSENT_EXPOSURES))
    )
  else safeLocalStorage?.removeItem(SIGNED_OUT_BET_UNSENT_KEY)
}

const scheduleRetry = () => {
  if (retryTimer !== undefined || retries >= RETRY_DELAYS_MS.length) return
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    flushSignedOutBetExposures()
  }, RETRY_DELAYS_MS[retries++])
}

const send = (item: UnsentExposure) => {
  if (sending.has(item.key)) return
  sending.add(item.key)
  const settle = (stored: boolean) => {
    sending.delete(item.key)
    if (!stored) return scheduleRetry()
    retries = 0
    setUnsent(
      getUnsent().filter(
        (other) => other.key !== item.key || other.time !== item.time
      )
    )
  }
  // track() adds to the object it is given, so each event gets its own.
  track(SIGNED_OUT_BET_TEST, {
    ...item.exposure,
    assignmentUnit: 'device',
    ...getEnrollmentFields(getFirstPress(), Date.now()),
  }).then(settle, () => settle(false))
}

// Send every exposure that is not yet known to be stored. A press calls
// this, and so does every page as it loads and again when someone signs in:
// a visitor whose exposure failed and who then signed up will never press
// signed-out again, and must not drop out of the test for it.
export function flushSignedOutBetExposures() {
  if (getIsNative() || !safeLocalStorage) return
  const stored = safeLocalStorage.getItem(SIGNED_OUT_BET_UNSENT_KEY)
  if (stored == null) return
  // Neither switch logs anything, so nothing is left waiting under them.
  const unsent = getMode() === 'experiment' ? getUnsent() : []
  // Drops what is unreadable or too old to enroll anyone.
  if (JSON.stringify(unsent) !== stored) setUnsent(unsent)
  unsent.forEach(send)
}

const wasPrompted = () =>
  promptedThisPage ||
  safeSessionStorage?.getItem(SIGNED_OUT_BET_PROMPTED_KEY) === '1'

const markPrompted = () => {
  promptedThisPage = true
  safeSessionStorage?.setItem(SIGNED_OUT_BET_PROMPTED_KEY, '1')
}

const setPendingBet = (bet: PendingBet) => {
  pendingBetLoaded = true
  pendingBet = bet
  safeSessionStorage?.setItem(PENDING_BET_KEY, JSON.stringify(bet))
  changed()
}

// The bet to reopen, if there is a fresh one. Taking it forgets it, so a
// ticket reopens once. A bet remembered just before a switch was thrown
// follows the switch: 'off' drops it, and 'on' reopens it without reporting.
export const takePendingBet = (): PendingBet | undefined => {
  if (!pendingBetLoaded) {
    pendingBetLoaded = true
    pendingBet = safeJsonParse(safeSessionStorage?.getItem(PENDING_BET_KEY))
  }
  const bet = readPendingBet(pendingBet, Date.now())
  pendingBet = undefined
  safeSessionStorage?.removeItem(PENDING_BET_KEY)
  const mode = getMode()
  if (!bet || mode === 'off') return undefined
  if (mode === 'experiment') return bet
  const { contractId, location, createdTime, outcome } = bet
  return { contractId, location, createdTime, ...(outcome ? { outcome } : {}) }
}

// The welcome steps report in, so a reopened bet can wait its turn.
export const registerWelcome = () => {
  welcomeMounts++
  changed()
  return () => {
    welcomeMounts--
    changed()
  }
}

export const markWelcomeFinished = (userId: string | undefined) => {
  welcomeFinishedFor = userId
  changed()
}

export const getWelcomeState = (userId: string | undefined) => ({
  welcomeMounted: welcomeMounts > 0,
  welcomeFinished: !!userId && welcomeFinishedFor === userId,
})

// Call from a bet button's click handler when nobody is signed in, in place of
// calling firebaseLogin directly. It has to run inside the click: browsers
// block a sign-in window that opens later.
export function onSignedOutBetPress(press: SignedOutBetPress) {
  const { contractId, location, surface, outcome } = press
  const { variant, enrolled, forced } = getAssignment()
  const plan = getSignedOutBetPressPlan({
    variant,
    surface,
    alreadyPrompted: wasPrompted(),
  })
  const properties = () => ({
    variant,
    forced,
    location,
    surface,
    contractId,
    environment: getEnvironment(),
  })

  if (enrolled) {
    const key = `${ensureDeviceToken()}|${variant}|${forced}`
    if (!exposures.has(key)) {
      exposures.add(key)
      noteFirstPress(surface, forced)
      setUnsent([
        ...getUnsent().filter((other) => other.key !== key),
        {
          key,
          time: Date.now(),
          // A device that has used the QA override says so from then on.
          exposure: {
            ...properties(),
            forced: forced || !!getFirstPress()?.qa,
          },
        },
      ])
    }
    flushSignedOutBetExposures()
  }

  if (plan.rememberBet)
    setPendingBet({
      contractId,
      location,
      createdTime: Date.now(),
      ...(outcome ? { outcome } : {}),
      ...(enrolled ? { enrolled, forced } : {}),
    })

  if (!plan.promptSignIn) return
  // Control never asks from a ticket, so it has nothing to remember.
  if (variant === 'treatment') markPrompted()

  const startedAt = Date.now()
  const report = (result: 'signed-in' | 'not-completed', code?: string) => {
    if (!enrolled) return
    track(SIGNED_OUT_BET_SIGN_IN_EVENT, {
      ...properties(),
      result,
      code,
      ms: Date.now() - startedAt,
    })
  }
  // A closed or blocked window rejects. That is an ordinary outcome here, not
  // an error to surface.
  firebaseLogin().then(
    () => report('signed-in'),
    (e: { code?: unknown } | undefined) =>
      report('not-completed', typeof e?.code === 'string' ? e.code : undefined)
  )
}
