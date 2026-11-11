import {
  getSignedOutBetAssignment,
  getSignedOutBetPressPlan,
  NO_SIGNED_OUT_BET_ASSIGNMENT,
  PENDING_BET_KEY,
  PendingBet,
  readFirstPressTime,
  readPendingBet,
  readSignedOutBetMode,
  SIGNED_OUT_BET_FIRST_PRESS_KEY,
  SIGNED_OUT_BET_FORCE_KEY,
  SIGNED_OUT_BET_PROMPTED_KEY,
  SIGNED_OUT_BET_SIGN_IN_EVENT,
  SIGNED_OUT_BET_TEST,
  SignedOutBetAssignment,
  SignedOutBetSurface,
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
// Exposures sent, or on their way, this page load. Keyed by device, variant
// and QA override, so a QA override switched on mid-page is logged as well.
const exposures = new Set<string>()
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

// Preview and localhost presses must never enter the production read.
const getEnvironment = () => {
  const { hostname } = window.location
  return ['manifold.markets', 'www.manifold.markets'].includes(hostname)
    ? 'production'
    : ['localhost', '127.0.0.1'].includes(hostname)
    ? 'local'
    : 'preview'
}

// When this device first pressed: now, unless it has pressed before.
const getFirstPressTime = () => {
  const stored = readFirstPressTime(
    safeJsonParse(safeLocalStorage?.getItem(SIGNED_OUT_BET_FIRST_PRESS_KEY))
  )
  if (stored) return stored
  const now = Date.now()
  safeLocalStorage?.setItem(SIGNED_OUT_BET_FIRST_PRESS_KEY, String(now))
  return now
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
  // track() adds to the object it is given, so each event gets its own.
  const properties = () => ({
    variant,
    forced,
    location,
    surface,
    contractId,
    environment: getEnvironment(),
  })

  if (enrolled) {
    const exposure = `${ensureDeviceToken()}|${variant}|${forced}`
    if (!exposures.has(exposure)) {
      exposures.add(exposure)
      // Events are stored best-effort. One that was not stored frees its
      // place, so the next press sends it again.
      const release = () => exposures.delete(exposure)
      track(SIGNED_OUT_BET_TEST, {
        ...properties(),
        assignmentUnit: 'device',
        // The report enrolls a device by its earliest exposure stored
        // within an hour of this.
        firstPressTime: getFirstPressTime(),
      }).then((stored) => {
        if (!stored) release()
      }, release)
    }
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
