import { Contract, PseudoNumericContract } from './contract'
import { formatLargeNumber, formatPercent } from './util/format'

export function formatNumericProbability(
  p: number,
  contract: PseudoNumericContract
) {
  const value = getMappedValue(contract, p)
  return formatLargeNumber(value)
}

export const getMappedValue = (contract: Contract, p: number) => {
  if (contract.outcomeType !== 'PSEUDO_NUMERIC') return p

  const { min, max, isLogScale } = contract

  if (isLogScale) {
    const logValue = p * Math.log10(max - min + 1)
    return 10 ** logValue + min - 1
  }

  return p * (max - min) + min
}

export const getFormattedMappedValue = (contract: Contract, p: number) => {
  if (contract.outcomeType !== 'PSEUDO_NUMERIC') return formatPercent(p)

  const value = getMappedValue(contract, p)
  return formatLargeNumber(value)
}

export const getPseudoProbability = (
  value: number,
  min: number,
  max: number,
  isLogScale = false
) => {
  if (value < min) return 0
  if (value > max) return 1

  if (isLogScale) {
    return Math.log10(value - min + 1) / Math.log10(max - min + 1)
  }

  return (value - min) / (max - min)
}
