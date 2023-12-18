export const constructPrefixTsQuery = (term: string) => {
  const sanitized = term
    .replace(/'/g, "''")
    .replace(/[!&|():*]/g, '')
    .trim()
  console.log(`Term: "${sanitized}"`)
  if (sanitized === '') return ''
  const tokens = sanitized.split(' ')
  return tokens.join(' & ') + ':*'
}
