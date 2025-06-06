import { ContractToken } from 'common/contract'
import { formatMoneyNumber } from 'common/util/format'
import { CASH_NAME, MANA_NAME } from 'constants/token-names'

export function formatMoneyVerbatim(amount: number, token: ContractToken) {
  return `${formatMoneyNumber(amount)} ${
    token === 'CASH' ? CASH_NAME : MANA_NAME
  }`
}
