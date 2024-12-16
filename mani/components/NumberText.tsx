import { ThemedText, ThemedTextProps } from './ThemedText'

export function NumberText({ children, style, ...rest }: ThemedTextProps) {
  return (
    <ThemedText family={'JetBrainsMono'} style={style} {...rest}>
      {children}
    </ThemedText>
  )
}
