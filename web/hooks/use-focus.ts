import { useRef } from 'react'

// Focus helper from https://stackoverflow.com/a/54159564/1222351
export function useFocus(): [React.RefObject<HTMLElement>, () => void] {
  const htmlElRef = useRef<HTMLElement>(null)
  const setFocus = () => {
    htmlElRef.current && htmlElRef.current.focus()
  }

  return [htmlElRef, setFocus]
}
