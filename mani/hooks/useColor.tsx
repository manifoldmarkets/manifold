import { useTokenMode } from './useTokenMode'
import { modes, Colors } from 'constants/Colors'

export const useColor = () => {
  const { mode } = useTokenMode()
  return {
    // Mode-specific colors
    ...modes[mode],
    // Theme colors
    ...Colors,
  }
}
