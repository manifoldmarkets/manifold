import clsx from 'clsx'
import { ReactNode, useLayoutEffect, useRef } from 'react'

// One line of text at the largest size (up to its class's) that fits its
// box: where it would wrap, truncate or run into the next label, it shrinks
// instead, down to `min` px; past that it ends in an ellipsis. With `short`
// (an abbreviation), it switches to that instead once the full text would
// shrink below `shortBelow` of its size. Measured in the browser, so the
// server renders the full text at the class's size, and it fits on load,
// once the web font is in, and whenever its box changes width.
export function FitText(props: {
  children: ReactNode
  short?: ReactNode
  className?: string
  // The smallest size, in px, it shrinks to.
  min?: number
  // The share of the class's size below which `short` takes over.
  shortBelow?: number
  title?: string
}) {
  const {
    children,
    short,
    className,
    min = 9,
    shortBelow = 0.85,
    title,
  } = props
  const ref = useRef<HTMLSpanElement>(null)
  const fullRef = useRef<HTMLSpanElement>(null)
  const shortRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const full = fullRef.current
    if (!el || !full) return
    const abbr = shortRef.current
    let width = -1
    // How wide `text` is at the box's font size, in fractional px:
    // whole-pixel scrollWidth misses text a fraction of a pixel too wide,
    // which still gets the ellipsis.
    const textWidth = (text: HTMLElement) => {
      const range = document.createRange()
      range.selectNodeContents(text)
      return range.getBoundingClientRect().width
    }
    const fit = (force: boolean) => {
      const box = el.getBoundingClientRect().width
      // Only a new width (or the font arriving) can change the fit; the
      // text shrinking changes the height, which would otherwise call this
      // again.
      if (!force && box === width) return
      width = box
      // From the class's size and the full text each time, so it grows
      // back when there's room.
      el.style.fontSize = ''
      full.style.display = ''
      if (abbr) abbr.style.display = 'none'
      const style = getComputedStyle(el)
      const base = parseFloat(style.fontSize)
      const room =
        box -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth)
      if (!(room > 0) || !Number.isFinite(base)) return
      // A hair under, so rounding can't tip it back over.
      const sizeFor = (need: number) =>
        need > room ? Math.floor(base * ((room - 0.5) / need) * 10) / 10 : base
      let size = sizeFor(textWidth(full))
      if (abbr && size < base * shortBelow) {
        full.style.display = 'none'
        abbr.style.display = ''
        size = sizeFor(textWidth(abbr))
      }
      if (size < base) el.style.fontSize = `${Math.max(min, size)}px`
    }
    fit(true)
    const observer = new ResizeObserver(() => fit(false))
    observer.observe(el)
    let live = true
    document.fonts?.ready.then(() => live && fit(true))
    return () => {
      live = false
      observer.disconnect()
    }
  }, [children, short, min, shortBelow])

  return (
    <span
      ref={ref}
      title={title}
      className={clsx(
        'block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
        className
      )}
    >
      <span ref={fullRef}>{children}</span>
      {short !== undefined && (
        <span ref={shortRef} style={{ display: 'none' }}>
          {short}
        </span>
      )}
    </span>
  )
}
