import { JSONContent } from './ContentRenderer'

export function isEmptyDescription(description: any): boolean {
  const text = extractTextFromContent(description)
  return !text || text.trim() === ''
}

export function extractTextFromContent(content: JSONContent | string): string {
  if (typeof content === 'string') {
    return content
  }

  // Handle leaf nodes first
  switch (content.type) {
    case 'mention':
      return `@${content.attrs?.label || ''}`
    case 'image':
      return '[image]'
    case 'linkPreview':
      return content.attrs?.url || ''
    case 'iframe':
      return content.attrs?.src || ''
    case 'text':
      return content.text || ''
    case 'heading':
      return `\n${content.content?.[0]?.text || ''}:`
    case 'bulletList':
      return (
        content.content
          ?.map((item) => `• ${extractTextFromContent(item)}`)
          .join('\n') || ''
      )
    case 'listItem':
      return (
        content.content
          ?.map((node) => extractTextFromContent(node))
          .join(' ') || ''
      )
  }

  // Handle nodes with content array
  if (content.content) {
    return content.content
      .map((node) => extractTextFromContent(node))
      .join(' ')
      .trim()
  }

  // Fallback for unknown nodes
  return ''
}
