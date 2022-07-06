import { BinaryContract, PseudoNumericContract } from './contract'
import { formatLargeNumber, formatPercent } from './util/format'

export function formatNumericProbability(
  p: number,
  contract: PseudoNumericContract
) {
  const value = getMappedValue(contract)(p)
  return formatLargeNumber(value)
}

export const getMappedValue =
  (contract: PseudoNumericContract | BinaryContract) => (p: number) => {
    if (contract.outcomeType === 'BINARY') return p

    const { min, max, isLogScale } = contract

    if (isLogScale) {
      const logValue = p * Math.log10(max - min)
      return 10 ** logValue + min
    }

    return p * (max - min) + min
  }

export const getFormattedMappedValue =
  (contract: PseudoNumericContract | BinaryContract) => (p: number) => {
    if (contract.outcomeType === 'BINARY') return formatPercent(p)

    const value = getMappedValue(contract)(p)
    return formatLargeNumber(value)
  }

export const getPseudoProbability = (
  value: number,
  min: number,
  max: number,
  isLogScale = false
) => {
  if (isLogScale) {
    return Math.log10(value - min) / Math.log10(max - min)
  }

  return (value - min) / (max - min)
}
