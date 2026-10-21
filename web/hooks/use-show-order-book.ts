import { createAccountToggle } from './use-account-toggle'

// Whether trade tickets open with the order book expanded. Saved to the
// account so it sticks across tickets, tabs, devices and reloads (see
// createAccountToggle). A failed save leaves the book as the user set it for
// this session rather than snapping it shut.
export const useShowOrderBook = createAccountToggle('showOrderBook', {
  label: 'Show order book',
  onSaveError: 'keep',
})
