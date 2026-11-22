import { createSportsViewClock } from './sports-view-clock'

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
