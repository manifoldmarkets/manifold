import { ThemedText, ThemedTextProps } from 'components/themed-text'

export function UserLink({
  username,
  name,
  limit,
  ...rest
}: {
  username?: string
  name?: string
  limit?: number
} & ThemedTextProps) {
  const displayText = name ?? username ?? 'Anonymous'
  const truncatedText =
    limit && displayText.length > limit
      ? `${displayText.slice(0, limit)}...`
      : displayText

  return <ThemedText {...rest}>{truncatedText}</ThemedText>
}
