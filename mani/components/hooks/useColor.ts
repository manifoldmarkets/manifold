import { useCallback } from 'react'
import { useTokenMode } from './useTokenMode'
import { Colors, modes } from 'constants/Colors'

export const useColor = () => {
  const { mode } = useTokenMode()
  return {
    // Mode-specific colors
    ...modes[mode],
    // Theme colors
    ...Colors,
  }
}
