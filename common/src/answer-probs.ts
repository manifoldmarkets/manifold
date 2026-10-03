import { orderBy, range, sum } from 'lodash'

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

// Rounds to a tenth of a percent like roundAnswerProbs, but spreads what's left
// over instead of putting it all on one answer: each rounds down, then the
// tenths that leaves short go one each to the ones rounded down the most, so
// none moves by a tenth or more. A copy of a big market needs this: 51 even
// answers each round up to 2%, 102% in all, and the whole -2 on one answer
// would leave it at 0%. Near ties go to the bigger answer, then the earlier.
const spreadRoundAnswerProbs = (probs: number[]) => {
  const tenths = probs.map((prob) => prob * 10)
  // The allowance keeps a value already on a tenth from flooring a tenth down.
  const rounded = tenths.map((t) => Math.floor(t + 1e-9))
  const short = Math.round(sum(tenths)) - sum(rounded)
  const nearly = (x: number) => Math.round(x * 1e6)
  orderBy(
    range(probs.length),
    [(i) => nearly(tenths[i] - rounded[i]), (i) => nearly(tenths[i])],
    ['desc', 'desc']
  )
    .slice(0, Math.max(0, short))
    .forEach((i) => rounded[i]++)
  return rounded.map((t) => t / 10)
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
  const rounded = spreadRoundAnswerProbs(fitted)
  return rounded.every((prob) => prob >= min && prob <= max)
    ? rounded
    : undefined
}

// Fits a live market's odds to seed a copy of it (see fitAnswerProbs), given
// in percent with any Other answer last. The copy doesn't list Other: it's
// recreated with whatever the other answers leave. So it's fitted along with
// them, then dropped, and kept a tenth clear of min and max, where adding up
// the rest in floating point could leave it a hair outside. Undefined if they
// can't all fit.
export const fitCopiedAnswerProbs = (
  probs: number[],
  shouldAnswersSumToOne: boolean,
  hasOther: boolean,
  min: number,
  max: number
) => {
  const fitted = fitAnswerProbs(probs, shouldAnswersSumToOne, min, max)
  if (!fitted || !hasOther) return fitted
  const listed = fitted.slice(0, -1)
  const other = 100 - sum(listed)
  const biggest = listed.indexOf(Math.max(...listed))
  const step = other < min + 0.05 ? -0.1 : other > max - 0.05 ? 0.1 : 0
  listed[biggest] = Math.round((listed[biggest] + step) * 10) / 10
  return listed.every((prob) => prob >= min && prob <= max) ? listed : undefined
}
