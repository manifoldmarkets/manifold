import { Contract, resolution } from 'common/contract'

const OUTCOME_TO_COLOR_TEXT = {
  YES: 'text-teal-600 dark:text-teal-100',
  NO: 'text-scarlet-600 dark:text-scarlet-100',
  CANCEL: 'text-ink-400',
  MKT: 'text-sky-600 dark:text-sky-100',
}

export function getTextColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_TEXT[resolution as resolution] ?? 'text-primary-200'
  }
  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'text-ink-600'
  }

  return 'text-ink-900'
}
