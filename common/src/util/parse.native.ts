// Simple content type to replace Tiptap's JSONContent
export type SimpleContent = {
  type?: string
  content?: SimpleContent[]
  attrs?: Record<string, any>
  text?: string
}

// URL regex pattern that handles common URL formats
const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi

/** get first url in text. like "notion.so " -> "http://notion.so"; "notion" -> null */
export function getUrl(text: string) {
  const matches = text.match(URL_REGEX)
  return matches ? matches[0] : null
}

export const beginsWith = (text: string, query: string) =>
  text.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())

// Simple fuzzy matching using character frequency and position
export const wordIn = (word: string, corpus: string) => {
  word = word.toLocaleLowerCase()
  corpus = corpus.toLocaleLowerCase()

  // Direct inclusion check
  if (corpus.includes(word)) return true

  // Character frequency check
  const wordChars = new Set(word)
  const corpusChars = new Set(corpus)
  const commonChars = [...wordChars].filter((char) => corpusChars.has(char))
  const similarity = commonChars.length / Math.max(word.length, corpus.length)

  return similarity > 0.7
}

const checkAgainstQuery = (query: string, corpus: string) =>
  query.split(' ').every((word) => wordIn(word, corpus))

export const searchInAny = (query: string, ...fields: string[]) =>
  fields.some((field) => checkAgainstQuery(query, field))

/** @return user ids of all \@mentions */
export function parseMentions(data: SimpleContent): string[] {
  const mentions = data.content?.flatMap(parseMentions) ?? [] //dfs
  if (data.type === 'mention' && data.attrs) {
    mentions.push(data.attrs.id as string)
  }
  return [...new Set(mentions)] // Using Set for uniqueness instead of lodash
}

export function richTextToString(content?: SimpleContent): string {
  if (!content) return ''

  try {
    if (content.text) return content.text

    const parts: string[] = []

    if (content.content) {
      content.content.forEach((node) => {
        let text = richTextToString(node)

        // Handle special node types
        switch (node.type) {
          case 'image':
            text = '[image]'
            break
          case 'iframe':
            text = '[embed]' + (node.attrs?.src ? `(${node.attrs.src})` : '')
            break
          case 'gridCardsComponent':
            text = '[markets]'
            break
          case 'linkPreview':
            text = '[link preview]'
            break
          case 'tweet':
            text = '[tweet]'
            break
          case 'spoiler':
            text = '[spoiler]'
            break
        }

        parts.push(text)
      })
    }

    return parts.join('\n\n')
  } catch (e) {
    console.error('error parsing rich text', `"${content}":`, e)
    return ''
  }
}

export function parseJsonContentToText(content: SimpleContent | string) {
  return typeof content === 'string' ? content : richTextToString(content)
}
