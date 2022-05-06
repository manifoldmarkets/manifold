export function normpdf(x: number, mean = 0, std = 1) {
  if (std === 0) {
    return x === mean ? Infinity : 0
  }

  return Math.exp((-0.5 * Math.pow(x - mean, 2)) / std) / Math.sqrt(TAU * std)
}

const TAU = Math.PI * 2
