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
