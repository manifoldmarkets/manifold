import { createAccountToggle } from './use-account-toggle'

// Every "Hide API trades" toggle shares one value, saved to the account so it
// sticks across markets, tabs, devices and reloads (see createAccountToggle).
// A failed save puts the filter back, so it doesn't look like it stuck.
export const useHideApiTrades = createAccountToggle('hideApiTrades', {
  label: 'Hide API trades',
  onSaveError: 'revert',
})
