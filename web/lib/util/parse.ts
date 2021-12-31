export function parseTags(text: string) {
  const regex = /(?:^|\s)(?:[#][a-z0-9_]+)/gi
  const matches = text.match(regex) || []
  return matches.map((match) => {
    const tag = match.trim().substring(1)
    return tag
  })
}
