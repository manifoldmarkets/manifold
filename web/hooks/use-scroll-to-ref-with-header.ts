import { useRef } from 'react'

export const CONTRACT_HEADER_HEIGHT = 100
export const useScrollToRefWithHeaderOffset = () => {
  const ref = useRef<HTMLDivElement>(null)

  const scrollToRefWithHeaderOffset = (
    ref: React.RefObject<HTMLDivElement>,
    offset: number
  ) => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const scrollPosition = rect.top + window.scrollY - offset
      console.log('scrollPosition', scrollPosition)
      window.scrollTo({ top: scrollPosition, behavior: 'smooth' })
    }
  }

  const scrollToRef = () => {
    scrollToRefWithHeaderOffset(ref, CONTRACT_HEADER_HEIGHT)
  }

  return { ref, scrollToRef }
}
