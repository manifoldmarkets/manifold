export type PerpTradingMode = 'enabled' | 'reduce-only' | 'halted'

export const getPerpTradingModeForConfig = (
  configuredMode: string | undefined,
  compiledEnabled: boolean
): PerpTradingMode => {
  const runtimeMode: PerpTradingMode =
    configuredMode == null || configuredMode === ''
      ? 'enabled'
      : configuredMode === 'enabled' ||
        configuredMode === 'reduce-only' ||
        configuredMode === 'halted'
      ? configuredMode
      : 'halted'

  return !compiledEnabled && runtimeMode === 'enabled'
    ? 'reduce-only'
    : runtimeMode
}
