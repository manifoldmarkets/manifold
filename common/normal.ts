export function normpdf(x: number, mean = 0, variance = 1) {
  if (variance === 0) {
    return x === mean ? Infinity : 0
  }

  return (
    Math.exp((-0.5 * Math.pow(x - mean, 2)) / variance) /
    Math.sqrt(TAU * variance)
  )
}

const TAU = Math.PI * 2
