import { useTokenMode } from './use-token-mode'
import { modes, Colors } from 'constants/colors'

export const useColor = () => {
  const { token } = useTokenMode()
  return {
    // Mode-specific colors
    ...modes[token],
    // Theme colors
    ...Colors,
  }
}
