import { AsyncLocalStorage } from 'node:async_hooks'
import { isSportsBdlEnabled } from 'common/bdl/rollout'

// A separately staged server switch. Existing F1 traffic keeps its original
// transport until both the rollout and this port are explicitly enabled.
export const useSharedF1Client = () =>
  process.env.SPORTS_BDL_F1_SHARED_CLIENT === 'true' && isSportsBdlEnabled()

export const f1WatchEnabled = () =>
  useSharedF1Client() && process.env.SPORTS_BDL_F1_CORRECTION_WATCH === 'true'

// The scheduler is the ordinary caller. The authenticated admin endpoint
// identifies its own concurrent reads without changing that job's budget.
const apiRead = new AsyncLocalStorage<boolean>()
export const f1ServiceRole = () => (apiRead.getStore() ? 'api' : 'scheduler')
export const withF1ApiRead = <T>(read: () => Promise<T>) =>
  useSharedF1Client() ? apiRead.run(true, read) : read()
