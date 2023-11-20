export const constructPrefixTsQuery = (term: string) => {
  const trimmed = term.trim()
  if (trimmed === '') return ''
  const sanitizedTrimmed = trimmed.replace(/'/g, "''").replace(/[!&|():*]/g, '')
  const tokens = sanitizedTrimmed.split(' ')
  return tokens.join(' & ') + ':*'
}
