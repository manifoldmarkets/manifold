import { sum } from 'lodash'

// The create form keeps one starting percentage per answer slot, blank slots
// included, so they line up with the answers by index. A blank slot isn't an
// answer yet — it gets dropped on submit — so it holds 0 until it's named.

// Rounds to a tenth of a percent, putting whatever rounding is left over on the
// biggest one so the total is unchanged.
export const roundAnswerProbs = (probs: number[]) => {
  if (probs.length === 0) return probs
  const rounded = probs.map((prob) => Math.round(prob * 10) / 10)
  const residual = sum(probs) - sum(rounded)
  const biggest = rounded.indexOf(Math.max(...rounded))
  rounded[biggest] = Math.round((rounded[biggest] + residual) * 10) / 10
  return rounded
}

// For answers that sum to one: sets one slot and rescales the rest so the total
// is unchanged. The named answers share a fixed pie, so a newcomer's slice
// comes out of the others and a leaver's slice goes back to them.
export const withAnswerProbSet = (
  probs: number[],
  index: number,
  prob: number
) => {
  const total = sum(probs)
  const othersTotal = total - probs[index]
  const scale = othersTotal > 0 ? (total - prob) / othersTotal : 0
  return roundAnswerProbs(probs.map((p, i) => (i === index ? prob : p * scale)))
}

// For answers that sum to one: drops a slot, handing its share back to the rest.
export const withAnswerProbRemoved = (probs: number[], index: number) =>
  withAnswerProbSet(probs, index, 0).filter((_, i) => i !== index)

// Fits odds read off a live market inside [min, max] so they can seed a new
// one: arbitrage can push a long shot under the floor bets can trade at.
// Independent answers are each clamped. Answers that sum to one keep their
// total of 100: whatever it takes to raise the ones under the floor comes out
// of the ones above it, in proportion to how far above it they are, so none of
// those drop under it either. Undefined if they can't all fit.
export const fitAnswerProbs = (
  probs: number[],
  shouldAnswersSumToOne: boolean,
  min: number,
  max: number
) => {
  if (!shouldAnswersSumToOne)
    return probs.map(
      (prob) => Math.round(Math.min(max, Math.max(min, prob)) * 10) / 10
    )

  const total = sum(probs)
  if (!(total > 0) || probs.length * min > 100) return undefined
  const scaled = probs.map((prob) => (prob / total) * 100)
  const shortfall = sum(scaled.map((prob) => Math.max(0, min - prob)))
  const room = sum(scaled.map((prob) => Math.max(0, prob - min)))
  const fitted =
    shortfall > 0
      ? scaled.map((prob) =>
          prob <= min ? min : prob - (shortfall * (prob - min)) / room
        )
      : scaled
  if (fitted.some((prob) => prob > max)) return undefined
  return roundAnswerProbs(fitted)
}
