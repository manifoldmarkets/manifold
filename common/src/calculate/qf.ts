// Functions for calculate quadratic funding amounts
import { QfTxn } from 'common/txn'
import { groupBy, mapValues, sumBy } from 'lodash'
// Note: none of this allows for undone payments

// Return a map of answer ids to totals
export function calculateTotals(txns: QfTxn[]) {
  const payTxns = txns.filter((txn) => txn.category === 'QF_PAYMENT')
  const grouped = groupBy(payTxns, 'data.answerId')
  return mapValues(grouped, (txns) => sumBy(txns, 'amount'))
}

export function totalPaid(txns: QfTxn[]) {
  const payTxns = txns.filter((txn) => txn.category === 'QF_PAYMENT')
  return sumBy(payTxns, 'amount')
}
