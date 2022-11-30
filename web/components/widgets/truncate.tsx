const truncatedLengths = {
  sm: { startslice: 10, endSlice: -10 },
  md: { startslice: 20, endSlice: -10 },
  lg: { startslice: 50, endSlice: -10 },
  xl: { startslice: 75, endSlice: -10 },
}

export type truncateLengthType = 'sm' | 'md' | 'lg' | 'xl' | 'none'
const TRUNCATE_BUFFER = 3

export function truncateText(
  text: string | undefined,
  truncateLength: truncateLengthType
) {
  if (truncateLength === 'none' || !text) {
    return text
  }
  const startSlice = truncatedLengths[truncateLength].startslice
  const endSlice = truncatedLengths[truncateLength].endSlice
  if (text.length <= startSlice + Math.abs(endSlice) + TRUNCATE_BUFFER) {
    return text
  }
  return text.slice(0, startSlice) + '...' + text.slice(endSlice)
}
