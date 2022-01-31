export function parseTags(text: string) {
  const regex = /(?:^|\s)(?:[#][a-z0-9_]+)/gi
  const matches = (text.match(regex) || []).map((match) =>
    match.trim().substring(1)
  )
  const tagSet = new Set()
  const uniqueTags: string[] = []
  // Keep casing of last tag.
  matches.reverse()
  for (const tag of matches) {
    const lowercase = tag.toLowerCase()
    if (!tagSet.has(lowercase)) {
      tagSet.add(lowercase)
      uniqueTags.push(tag)
    }
  }
  uniqueTags.reverse()
  return uniqueTags
}

export function parseWordsAsTags(text: string) {
  const taggedText = text
    .split(/\s+/)
    .map((tag) => `#${tag}`)
    .join(' ')
  return parseTags(taggedText)
}
