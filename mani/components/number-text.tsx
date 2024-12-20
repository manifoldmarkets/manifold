import { ThemedText, ThemedTextProps } from './themed-text'

export function NumberText({ children, style, ...rest }: ThemedTextProps) {
  return (
    <ThemedText family={'JetBrainsMono'} style={style} {...rest}>
      {children}
    </ThemedText>
  )
}
