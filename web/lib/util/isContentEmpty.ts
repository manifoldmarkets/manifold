import { JSONContent } from '@tiptap/core'

export function isContentEmpty(content: JSONContent | string | undefined) {
  if (!content || content == '') {
    return true
  }
  if (
    typeof content != 'string' &&
    content.type === 'doc' &&
    Array.isArray(content.content)
  ) {
    return content.content.every((item) => {
      return Object.keys(item).length === 1 && item.type !== undefined
    })
  }
  return false
}
