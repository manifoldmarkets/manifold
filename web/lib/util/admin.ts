import dayjs from 'dayjs'
import { Contract } from '../firebase/contracts'

// Requires an admin to resolve a week after market closes.
export function needsAdminToResolve(contract: Contract) {
  return !contract.isResolved && dayjs().diff(contract.closeTime, 'day') > 7
}
