import { PERPS_ENABLED } from 'common/envs/constants'
import {
  getPerpTradingModeForConfig,
  type PerpTradingMode,
} from 'common/perps/trading-mode'

import { APIError } from './endpoint'

// Runtime incident control for the API. This is intentionally read per request
// so tests and long-lived processes do not capture a stale value. Changing a
// deployed service's environment still requires rolling its instances.
export const getPerpTradingMode = (): PerpTradingMode =>
  getPerpTradingModeForConfig(process.env.PERP_TRADING_MODE, PERPS_ENABLED)

export const assertPerpExposureIncreaseEnabled = () => {
  const mode = getPerpTradingMode()
  if (mode !== 'enabled')
    throw new APIError(
      503,
      mode === 'halted'
        ? 'Perp trading is temporarily halted'
        : 'Perps are temporarily reduce-only'
    )
}

export const assertPerpCloseEnabled = () => {
  if (getPerpTradingMode() === 'halted')
    throw new APIError(503, 'Perp trading is temporarily halted')
}
