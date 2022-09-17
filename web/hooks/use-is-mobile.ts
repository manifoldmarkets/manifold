import { useWindowSize } from 'web/hooks/use-window-size'

// matches talwind sm breakpoint
export function useIsMobile() {
  const { width } = useWindowSize()
  return (width ?? 0) < 640
}
