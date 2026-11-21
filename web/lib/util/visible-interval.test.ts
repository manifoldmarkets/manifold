import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setVisibleInterval, VisibleIntervalEnv } from './visible-interval'

// A fake clock and document: tick(ms) fires due intervals in order.
function fakeEnv(hidden = false) {
  const listeners: (() => void)[] = []
  let now = 0
  let nextId = 1
  const timers = new Map<number, { fn: () => void; ms: number; due: number }>()
  const doc = {
    hidden,
    addEventListener: (_: 'visibilitychange', l: () => void) => {
      listeners.push(l)
    },
    removeEventListener: (_: 'visibilitychange', l: () => void) => {
      const i = listeners.indexOf(l)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  const env: VisibleIntervalEnv = {
    doc,
    setInterval: (fn, ms) => {
      const id = nextId++
      timers.set(id, { fn, ms, due: now + ms })
      return id
    },
    clearInterval: (id) => {
      timers.delete(id as number)
    },
  }
  const tick = (ms: number) => {
    const end = now + ms
    for (;;) {
      let next: [number, { fn: () => void; ms: number; due: number }] | null =
        null
      timers.forEach((t, id) => {
        if (t.due <= end && (!next || t.due < next[1].due)) next = [id, t]
      })
      if (!next) break
      const [, t] = next as [
        number,
        { fn: () => void; ms: number; due: number }
      ]
      now = t.due
      t.due += t.ms
      t.fn()
    }
    now = end
  }
  const setHidden = (value: boolean) => {
    doc.hidden = value
    listeners.slice().forEach((l) => l())
  }
  return { env, tick, setHidden, listeners, timers }
}

test('runs on the period while visible, not on start', () => {
  const { env, tick } = fakeEnv()
  let calls = 0
  const stop = setVisibleInterval(() => calls++, 1000, env)
  assert.equal(calls, 0)
  tick(3000)
  assert.equal(calls, 3)
  stop()
})

test('never runs while hidden, then catches up once on return', () => {
  const { env, tick, setHidden, timers } = fakeEnv()
  let calls = 0
  const stop = setVisibleInterval(() => calls++, 1000, env)
  tick(1000)
  assert.equal(calls, 1)

  setHidden(true)
  assert.equal(timers.size, 0, 'the timer is cleared while hidden')
  tick(60_000)
  assert.equal(calls, 1, 'no calls while hidden')

  setHidden(false)
  assert.equal(calls, 2, 'immediate call on becoming visible')
  // The period restarts at the catch-up call: nothing extra 500ms later.
  tick(500)
  assert.equal(calls, 2)
  tick(500)
  assert.equal(calls, 3)
  stop()
})

test('a tab that starts hidden waits until it is shown', () => {
  const { env, tick, setHidden } = fakeEnv(true)
  let calls = 0
  const stop = setVisibleInterval(() => calls++, 1000, env)
  tick(10_000)
  assert.equal(calls, 0)
  setHidden(false)
  assert.equal(calls, 1)
  tick(1000)
  assert.equal(calls, 2)
  stop()
})

test('a repeated visible event does not double the catch-up', () => {
  const { env, setHidden } = fakeEnv()
  let calls = 0
  const stop = setVisibleInterval(() => calls++, 1000, env)
  setHidden(false) // already visible, e.g. a duplicate event
  assert.equal(calls, 0)
  stop()
})

test('cleanup stops the timer and removes the listener', () => {
  const { env, tick, setHidden, listeners, timers } = fakeEnv()
  let calls = 0
  const stop = setVisibleInterval(() => calls++, 1000, env)
  stop()
  assert.equal(listeners.length, 0)
  assert.equal(timers.size, 0)
  tick(5000)
  setHidden(true)
  setHidden(false)
  assert.equal(calls, 0)
})
