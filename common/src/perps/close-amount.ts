import { PERP_MIN_CLOSE_FRACTION } from './amm'
import { formatPerpClosePercent } from './format'

export type PerpCloseAmountUnit = 'percent' | 'mana'

export type PerpCloseAmount = {
  unit: PerpCloseAmountUnit
  input: string
  // Keep the unrounded selection separately from its editable display. Unit
  // switches and later oracle ticks must not silently resize a chosen close.
  fraction: number | null
}

export const canEnterPerpCloseMana = (fullPayout: number) =>
  Number.isFinite(fullPayout) && fullPayout > 0

export const perpCloseAmountFromInput = (
  input: string,
  unit: PerpCloseAmountUnit,
  fullPayout: number
): PerpCloseAmount => {
  const amount = input.trim() === '' ? NaN : Number(input)
  const max = unit === 'percent' ? 100 : fullPayout
  const fraction =
    !Number.isFinite(amount) || !canEnterPerpCloseMana(max)
      ? null
      : // Multiplying then dividing the minimum can land one ULP below it.
      // Recognize the exact endpoint without forgiving genuinely smaller input.
      amount === max * PERP_MIN_CLOSE_FRACTION
      ? PERP_MIN_CLOSE_FRACTION
      : amount / max
  return { unit, input, fraction }
}

export const perpCloseAmountFromFraction = (
  fraction: number | null,
  unit: PerpCloseAmountUnit,
  fullPayout: number
): PerpCloseAmount => {
  const amount =
    fraction == null ? NaN : fraction * (unit === 'percent' ? 100 : fullPayout)
  const input = !Number.isFinite(amount)
    ? ''
    : fraction != null && (fraction < PERP_MIN_CLOSE_FRACTION || fraction > 1)
    ? // Don't display an invalid selection as a valid boundary (e.g. 0.999%
      // as 1%) while still disabling the confirmation for the original value.
      String(amount)
    : unit === 'percent' &&
      fraction != null &&
      fraction >= PERP_MIN_CLOSE_FRACTION &&
      fraction <= 1
    ? formatPerpClosePercent(fraction).slice(0, -1)
    : // Show cents normally, but don't turn a positive sub-cent payout into 0.
      String(
        Number(
          Math.abs(amount) > 0 && Math.abs(amount) < 0.01
            ? amount.toPrecision(2)
            : amount.toFixed(2)
        )
      )
  return { unit, input, fraction }
}

export const getPerpCloseAmountError = (
  selection: PerpCloseAmount,
  fullPayout: number
) => {
  if (selection.unit === 'mana' && !canEnterPerpCloseMana(fullPayout))
    return 'unavailable'
  const { fraction } = selection
  if (fraction == null || !Number.isFinite(fraction)) return 'missing'
  if (fraction < PERP_MIN_CLOSE_FRACTION) return 'below-minimum'
  if (fraction > 1) return 'above-maximum'
  return null
}
