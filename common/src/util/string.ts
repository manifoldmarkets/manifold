export function removeEmojis(str: string) {
  return str
    .replace(
      /\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Modifier}|\p{Emoji_Component}/gu,
      ''
    )
    .trim()
}
