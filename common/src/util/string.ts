export function removeEmojis(str: string) {
  if (!str) return ''

  // Step 1: Handle flag emojis by direct replacement
  let result = str.replace(/\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]/g, '')

  // Step 2: Remove all other emoji types
  result = result.replace(
    /\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Modifier}/gu,
    ''
  )

  // Step 3: Remove any remaining variation selectors (U+FE0F) and joiners explicitly
  result = result.replace(/[\uFE0F\u200D]/g, '')

  // Then remove any leading/trailing spaces
  result = result.trim()

  return result
}
