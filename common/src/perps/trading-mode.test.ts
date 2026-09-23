import { getPerpTradingModeForConfig } from './trading-mode'

describe('getPerpTradingModeForConfig', () => {
  test.each([
    [undefined, true, 'enabled'],
    ['', true, 'enabled'],
    [undefined, false, 'reduce-only'],
    ['', false, 'reduce-only'],
    ['enabled', false, 'reduce-only'],
    ['reduce-only', false, 'reduce-only'],
    ['halted', false, 'halted'],
    ['reduce-only', true, 'reduce-only'],
    ['halted', true, 'halted'],
    ['ENABLED', true, 'halted'],
    ['unknown', true, 'halted'],
    ['unknown', false, 'halted'],
  ] as const)(
    'configured=%p compiled=%p returns %p',
    (configuredMode, compiledEnabled, expected) => {
      expect(getPerpTradingModeForConfig(configuredMode, compiledEnabled)).toBe(
        expected
      )
    }
  )
})
