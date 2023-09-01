import { useEffect, useState } from 'react'
import { FullscreenConfetti } from './widgets/fullscreen-confetti'

export const ConfettiOnDemand = () => {
  const [confettiCount, setConfettiCount] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'c' || e.code === 'KeyC')) {
        setConfettiCount((count) => count + 1)
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      {Array.from({ length: confettiCount }).map((_, i) => (
        <FullscreenConfetti key={i} />
      ))}
    </>
  )
}
