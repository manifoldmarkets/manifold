import { debounce } from 'lodash'
import { RefObject, useMemo, useLayoutEffect, useRef, useState } from 'react'

type elem_size =
  | { width: number; height: number }
  | { width: undefined; height: undefined }

const getSize = (elem: HTMLElement | null) =>
  elem
    ? { width: elem.offsetWidth, height: elem.offsetHeight }
    : { width: undefined, height: undefined }

export function useListenElemSize<T extends HTMLElement>(
  elemRef: RefObject<T | null>,
  callback: (size: elem_size) => void,
  debounceMs: number | undefined = undefined
) {
  const handleResize = useMemo(() => {
    const updateSize = () => {
      if (elemRef.current) callback(getSize(elemRef.current))
    }

    return debounceMs
      ? debounce(updateSize, debounceMs, { leading: false, trailing: true })
      : updateSize
  }, [callback, elemRef, debounceMs])

  const elem = elemRef.current

  useLayoutEffect(() => {
    if (!elemRef.current) return

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(elemRef.current)

    return () => resizeObserver.disconnect()
  }, [elemRef, elem, handleResize])
}

export function useMeasureSize(debounceMs: number | undefined = undefined) {
  const elemRef = useRef<HTMLElement | null>(null)
  const [size, setSize] = useState(() => getSize(null))
  const sizeRef = useRef<elem_size>(size)

  const setSizeIfDifferent = (newSize: typeof size) => {
    if (newSize?.height !== size?.height || newSize?.width !== size?.width) {
      sizeRef.current = newSize
      setSize(newSize)
    }
  }

  useListenElemSize(elemRef, setSizeIfDifferent, debounceMs)

  const setElem = (elem: HTMLElement | null) => {
    elemRef.current = elem

    if (elem) {
      setSizeIfDifferent(getSize(elem))
    }
  }

  return { setElem, elemRef, sizeRef, ...size }
}
