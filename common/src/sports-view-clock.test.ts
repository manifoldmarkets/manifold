import { createSportsViewClock, sportsTimerDelay } from './sports-view-clock'

it('ages a cached response by origin time and Age independently of local wall-clock skew', () => {
  const at = Date.UTC(2026, 10, 22, 15)
  let elapsed = 1000
  const clock = createSportsViewClock(() => elapsed)
  clock.observe(at, new Date(at + 3000).toUTCString(), '59')
  expect(clock.now()).toBe(at + 62000)
  elapsed += 1500
  expect(clock.now()).toBe(at + 63500)
  clock.observe(at, new Date(at + 3000).toUTCString(), '59')
  expect(clock.now()).toBe(at + 63500)
  clock.observe(at + 70000, null, null)
  expect(clock.now()).toBe(at + 70000)
  clock.observe(at + 71000, null, 'invalid')
  expect(clock.now()).toBe(at + 71000)
})

it('takes a bound server receipt as a lower clock bound despite slower HTTP, without accepting an arbitrary future value', () => {
  const epoch = Date.UTC(2026, 10, 22, 11)
  let elapsed = 1000
  const clock = createSportsViewClock(() => elapsed)
  expect(clock.observeReceipt(epoch)).toBe(false)
  clock.observe(epoch, null, null)
  elapsed += 20
  expect(clock.observeReceipt(epoch + 100)).toBe(true)
  expect(clock.now()).toBe(epoch + 100)
  expect(clock.observeReceipt(epoch + 3600000)).toBe(false)
  expect(clock.observeReceipt(NaN)).toBe(false)
  expect(clock.observeReceipt(epoch + 50)).toBe(true)
  expect(clock.now()).toBe(epoch + 100)
})

it('recomputes immediately when an expiry crosses between render and timer installation', () => {
  expect(sportsTimerDelay([100, 150, Infinity], 99, 101)).toBe(0)
  expect(sportsTimerDelay([100, 150], 100, 121)).toBe(29)
  expect(sportsTimerDelay([100, 150], 150, 151)).toBeUndefined()
})
