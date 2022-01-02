import _ from 'lodash'

export function parseTags(text: string) {
  const regex = /(?:^|\s)(?:[#][a-z0-9_]+)/gi
  const matches = (text.match(regex) || []).map((match) =>
    match.trim().substring(1)
  )
  return _.uniqBy(matches, (tag) => tag.toLowerCase())
}
