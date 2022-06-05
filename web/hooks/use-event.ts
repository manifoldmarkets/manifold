// A hook soon to be added to the React core library:
// https://github.com/reactjs/rfcs/blob/useevent/text/0000-useevent.md
// TODO: Once React adds this hook, use it instead.

import { useRef, useLayoutEffect, useCallback } from 'react'

type AnyFunction = (...args: any[]) => any

export function useEvent<T extends AnyFunction>(callback?: T) {
  const ref = useRef<AnyFunction | undefined>(() => {
    throw new Error('Cannot call an event handler while rendering.')
  })
  useLayoutEffect(() => {
    ref.current = callback
  })
  return useCallback<AnyFunction>(
    (...args) => ref.current?.apply(null, args),
    []
  ) as T
}

/**
 * Usage
function Component(props) {
  const [visible, setVisible] = useState(false)

  // props.onToggle may not be stable
  const onToggle = useEvent(props.onToggle)

  // But our onToggle is stable
  useEffect(() => onToggle(visible), [onToggle, visible])

  // ❌ Throws when used in the render phase
  onToggle(visible)
}
*/
