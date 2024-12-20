import { useTokenMode } from './useTokenMode'
import { modes, Colors } from 'constants/Colors'

export const useColor = () => {
  const { token } = useTokenMode()
  return {
    // Mode-specific colors
    ...modes[token],
    // Theme colors
    ...Colors,
  }
}
