// returns a string no longr than 4 characters
export function shortenNumber(num: number): string {
  if (num < 1e3) return num.toString() // less than 1000
  if (num >= 1e3 && num < 1e6) return +(num / 1e3).toFixed(1) + 'k' // less than 1 million
  if (num >= 1e6 && num < 1e9) return +(num / 1e6).toFixed(1) + 'M' // less than 1 billion
  if (num >= 1e9 && num < 1e12) return +(num / 1e9).toFixed(1) + 'B' // less than 1 trillion
  if (num >= 1e12) return +(num / 1e12).toFixed(1) + 'T' // trillion or more
  return num.toString()
}
