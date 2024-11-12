import { isEqual } from 'lodash'
import { useCallback, useRef, useState } from 'react'

export const useStateCheckEquality = <T>(initialState: T) => {
  const [state, setState] = useState(initialState)

  const stateRef = useRef(state)
  stateRef.current = state

  const checkSetState = useCallback(
    (next: T) => {
      const state = stateRef.current
      if (!isEqual(state, next)) {
        setState(next)
      }
    },
    [stateRef]
  )

  return [state, checkSetState] as const
}
