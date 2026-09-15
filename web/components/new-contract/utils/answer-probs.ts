import { sum } from 'lodash'

// Rounds starting probabilities to a tenth of a percent for display, putting
// whatever rounding is left over on the biggest one so the total is unchanged.
const roundPreservingTotal = (probs: number[]) => {
  if (probs.length === 0) return probs
  const rounded = probs.map((prob) => Math.round(prob * 10) / 10)
  const residual = sum(probs) - sum(rounded)
  const biggest = rounded.indexOf(Math.max(...rounded))
  rounded[biggest] = Math.round((rounded[biggest] + residual) * 10) / 10
  return rounded
}

// A new answer takes an even share of the total and the others shrink to make
// room, so the percentages still add up to whatever they added up to before.
export const withAnswerProbAdded = (probs: number[]) => {
  if (probs.length === 0) return [100]
  const n = probs.length
  return roundPreservingTotal([
    ...probs.map((prob) => (prob * n) / (n + 1)),
    sum(probs) / (n + 1),
  ])
}

// The removed answer's share is spread back over the rest in proportion.
export const withAnswerProbRemoved = (probs: number[], index: number) => {
  const rest = probs.filter((_, i) => i !== index)
  const restTotal = sum(rest)
  if (restTotal === 0) return rest
  const scale = sum(probs) / restTotal
  return roundPreservingTotal(rest.map((prob) => prob * scale))
}
