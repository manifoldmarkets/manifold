export function parseTags(text: string) {
  const regex = /(?:^|\s)(?:[#][a-z0-9_]+)/gi
  const matches = (text.match(regex) || []).map((match) =>
    match.trim().substring(1)
  )
  const tagSet = new Set(matches)
  const uniqueTags: string[] = []
  tagSet.forEach((tag) => uniqueTags.push(tag))
  return uniqueTags
}

export function parseWordsAsTags(text: string) {
  const regex = /(?:^|\s)(?:#?[a-z0-9_]+)/gi
  const matches = (text.match(regex) || [])
    .map((match) => match.replace('#', '').trim())
    .filter((tag) => tag)
  const tagSet = new Set(matches)
  const uniqueTags: string[] = []
  tagSet.forEach((tag) => uniqueTags.push(tag))
  return uniqueTags
}
