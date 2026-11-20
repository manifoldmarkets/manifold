export const splitSearchQuery = (query: string) =>
  query
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)

// Commas combine matches; an empty entry must not match every result.
export function matchesSearchQuery(
  query: string,
  matchesTerm: (term: string) => boolean
) {
  const terms = splitSearchQuery(query)
  return terms.length === 0 || terms.some(matchesTerm)
}
