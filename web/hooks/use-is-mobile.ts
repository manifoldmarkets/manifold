import { useWindowSize } from 'web/hooks/use-window-size'

export function useIsMobile() {
  const { width } = useWindowSize()
  return (width ?? 0) < 600
}