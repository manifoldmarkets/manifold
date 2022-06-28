import { PseudoNumericContract } from './contract'

export function formatNumericProbability(
  p: number,
  contract: PseudoNumericContract
) {
  const { min, max } = contract
  const value = p * (max - min) + min
  return Math.round(value).toString()
}
