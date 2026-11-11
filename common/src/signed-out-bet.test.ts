import { getDeterministicABTestVariant } from './ab-test'
import { BROWSE_EXPERIMENT } from './browse-rollout'
import {
  getSignedOutBetAssignment,
  getSignedOutBetPressPlan,
  PENDING_BET_TTL_MS,
  readPendingBet,
  readSignedOutBetMode,
  shouldWaitForWelcome,
  SIGNED_OUT_BET_TEST,
} from './signed-out-bet'

const tokens = Array.from({ length: 4000 }, (_, i) => `device-${i}`)
const variants = ['control', 'treatment'] as const

describe('signed-out bet sign-in assignment', () => {
  it('reads the rollout mode, defaulting to the experiment', () => {
    expect(readSignedOutBetMode(undefined)).toBe('experiment')
    expect(readSignedOutBetMode('')).toBe('experiment')
    expect(readSignedOutBetMode('OFF')).toBe('experiment')
    expect(readSignedOutBetMode('off')).toBe('off')
    expect(readSignedOutBetMode('on')).toBe('on')
  })

  it('is stable per device and close to an even split', () => {
    const assign = () =>
      tokens.map(
        (deviceToken) =>
          getSignedOutBetAssignment({ deviceToken, mode: 'experiment' }).variant
      )
    const first = assign()
    expect(assign()).toEqual(first)
    const share = first.filter((v) => v === 'treatment').length / first.length
    expect(share).toBeGreaterThan(0.46)
    expect(share).toBeLessThan(0.54)
  })

  it('enrolls experiment devices without marking them forced', () => {
    expect(
      getSignedOutBetAssignment({ deviceToken: 'abc', mode: 'experiment' })
    ).toEqual({
      variant: getDeterministicABTestVariant(
        SIGNED_OUT_BET_TEST,
        'device:abc',
        variants
      ),
      enrolled: true,
      forced: false,
    })
  })

  it('is not the browse experiment split under another name', () => {
    const same = tokens.filter(
      (token) =>
        getSignedOutBetAssignment({ deviceToken: token, mode: 'experiment' })
          .variant ===
        getDeterministicABTestVariant(
          BROWSE_EXPERIMENT,
          `device:${token}`,
          variants
        )
    ).length
    expect(same / tokens.length).toBeGreaterThan(0.45)
    expect(same / tokens.length).toBeLessThan(0.55)
  })

  it('assigns nobody when switched off or rolled out', () => {
    for (const deviceToken of tokens.slice(0, 50)) {
      expect(getSignedOutBetAssignment({ deviceToken, mode: 'off' })).toEqual({
        variant: 'control',
        enrolled: false,
        forced: false,
      })
      expect(getSignedOutBetAssignment({ deviceToken, mode: 'on' })).toEqual({
        variant: 'treatment',
        enrolled: false,
        forced: false,
      })
    }
  })

  it('honors a QA override only in the experiment, and flags it', () => {
    for (const forced of variants) {
      for (const deviceToken of tokens.slice(0, 50)) {
        expect(
          getSignedOutBetAssignment({ deviceToken, mode: 'experiment', forced })
        ).toEqual({ variant: forced, enrolled: true, forced: true })
        expect(
          getSignedOutBetAssignment({ deviceToken, mode: 'off', forced })
        ).toEqual({ variant: 'control', enrolled: false, forced: false })
        expect(
          getSignedOutBetAssignment({ deviceToken, mode: 'on', forced })
        ).toEqual({ variant: 'treatment', enrolled: false, forced: false })
      }
    }
  })

  it('ignores a malformed override', () => {
    for (const forced of ['', 'TREATMENT', 'yes', null, 1, {}]) {
      expect(
        getSignedOutBetAssignment({
          deviceToken: 'abc',
          mode: 'experiment',
          forced,
        })
      ).toEqual(
        getSignedOutBetAssignment({ deviceToken: 'abc', mode: 'experiment' })
      )
    }
  })
})

describe('signed-out bet press plan', () => {
  const plan = getSignedOutBetPressPlan

  it('leaves control exactly as it was', () => {
    // A ticket has its own sign-up button; nothing opens by itself.
    for (const alreadyPrompted of [false, true]) {
      expect(
        plan({ variant: 'control', surface: 'ticket', alreadyPrompted })
      ).toEqual({ promptSignIn: false, rememberBet: false })
      // A row or card button has always opened sign-in, and nothing after it.
      expect(
        plan({ variant: 'control', surface: 'button', alreadyPrompted })
      ).toEqual({ promptSignIn: true, rememberBet: false })
    }
  })

  it('opens sign-in from a ticket once, then leaves it to the ticket', () => {
    expect(
      plan({ variant: 'treatment', surface: 'ticket', alreadyPrompted: false })
    ).toEqual({ promptSignIn: true, rememberBet: false })
    expect(
      plan({ variant: 'treatment', surface: 'ticket', alreadyPrompted: true })
    ).toEqual({ promptSignIn: false, rememberBet: false })
  })

  it('remembers a button bet on every press', () => {
    for (const alreadyPrompted of [false, true]) {
      expect(
        plan({ variant: 'treatment', surface: 'button', alreadyPrompted })
      ).toEqual({ promptSignIn: true, rememberBet: true })
    }
  })
})

describe('pending bet', () => {
  const now = 1_800_000_000_000
  const bet = {
    contractId: 'c1',
    location: 'contract table',
    createdTime: now - 1000,
  }

  it('reads a fresh bet and drops unknown fields', () => {
    expect(readPendingBet(bet, now)).toEqual(bet)
    expect(
      readPendingBet({ ...bet, outcome: 'NO', userId: 'someone' }, now)
    ).toEqual({ ...bet, outcome: 'NO' })
    expect(readPendingBet({ ...bet, createdTime: now }, now)).toEqual({
      ...bet,
      createdTime: now,
    })
  })

  it('expires', () => {
    expect(
      readPendingBet({ ...bet, createdTime: now - PENDING_BET_TTL_MS + 1 }, now)
    ).toBeDefined()
    expect(
      readPendingBet({ ...bet, createdTime: now - PENDING_BET_TTL_MS }, now)
    ).toBeUndefined()
  })

  it('rejects a bet from the future', () => {
    expect(
      readPendingBet({ ...bet, createdTime: now + 1 }, now)
    ).toBeUndefined()
  })

  it('rejects malformed values', () => {
    for (const value of [
      undefined,
      null,
      '',
      'c1',
      42,
      [],
      {},
      { ...bet, contractId: '' },
      { ...bet, contractId: 7 },
      { ...bet, location: undefined },
      { ...bet, createdTime: '1800000000000' },
      { ...bet, createdTime: NaN },
      { ...bet, createdTime: Infinity },
      { ...bet, outcome: 'MAYBE' },
      { ...bet, outcome: null },
    ]) {
      expect(readPendingBet(value, now)).toBeUndefined()
    }
  })
})

describe('waiting for the welcome steps', () => {
  it('waits only while a mounted welcome flow is unfinished', () => {
    expect(
      shouldWaitForWelcome({
        shouldShowWelcome: true,
        welcomeMounted: true,
        welcomeFinished: false,
      })
    ).toBe(true)
    // No welcome flow on this page: nothing would ever finish it.
    expect(
      shouldWaitForWelcome({
        shouldShowWelcome: true,
        welcomeMounted: false,
        welcomeFinished: false,
      })
    ).toBe(false)
    expect(
      shouldWaitForWelcome({
        shouldShowWelcome: true,
        welcomeMounted: true,
        welcomeFinished: true,
      })
    ).toBe(false)
    for (const shouldShowWelcome of [false, undefined]) {
      expect(
        shouldWaitForWelcome({
          shouldShowWelcome,
          welcomeMounted: true,
          welcomeFinished: false,
        })
      ).toBe(false)
    }
  })
})
