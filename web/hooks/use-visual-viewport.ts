import { useEffect, useState } from 'react'

// The keyboard can shrink the visual viewport without changing dvh or the
// layout viewport. Track its position too, since Safari pans to focused inputs.
export function useVisualViewport(enabled: boolean) {
  const [size, setSize] = useState<
    { height: number; offsetTop: number } | undefined
  >()

  useEffect(() => {
    const viewport = window.visualViewport
    if (!enabled || !viewport) {
      setSize(undefined)
      return
    }

    const update = () => {
      // Keep ordinary pinch zoom working without resizing the dialog around
      // each gesture. Resume keyboard fitting when the user zooms back out.
      if (Math.abs(viewport.scale - 1) > 0.01) return
      const { height, offsetTop } = viewport
      if (
        !Number.isFinite(height) ||
        height <= 0 ||
        !Number.isFinite(offsetTop)
      )
        return
      setSize((previous) =>
        previous?.height === height && previous.offsetTop === offsetTop
          ? previous
          : { height, offsetTop }
      )
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [enabled])

  return size
}
