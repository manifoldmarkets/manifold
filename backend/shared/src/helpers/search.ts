import { log } from 'shared/utils'

export const normalizeHyphens = (text: string) => {
  return text.replace(/[-−–—]/g, '')
}

export const constructPrefixTsQuery = (term: string) => {
  const sanitized = term
    .replace(/'/g, "''")
    .replace(/[!&|():*<>]/g, '')
    .trim()
  log(`Term: "${sanitized}"`)
  if (sanitized === '') return ''
  const tokens = sanitized.split(/\s+/)
  return tokens.join(' & ') + ':*'
}

export const constructPrefixTsQueryNormalized = (term: string) => {
  const normalizedTerm = normalizeHyphens(term)
  const sanitized = normalizedTerm
    .replace(/'/g, "''")
    .replace(/[!&|():*<>]/g, '')
    .trim()
  log(`Normalized term: "${sanitized}"`)
  if (sanitized === '') return ''
  const tokens = sanitized.split(/\s+/)
  return tokens.join(' & ') + ':*'
}

export const constructIlikeQuery = (term: string) => {
  const sanitized = term
    .replace(/'/g, "''")
    .replace(/[_%()<>]/g, '')
    .trim()

  if (sanitized === '') return ''
  return '%' + sanitized + '%' // ideally we'd do prefix but many groups have leading emojis
}
