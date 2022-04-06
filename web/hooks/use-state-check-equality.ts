import _ from 'lodash'
import { useMemo, useRef, useState } from 'react'

export const useStateCheckEquality = <T>(initialState: T) => {
  const [state, setState] = useState(initialState)

  const stateRef = useRef(state)
  stateRef.current = state

  const checkSetState = useMemo(
    () => (newState: T) => {
      const state = stateRef.current
      if (!_.isEqual(state, newState)) {
        setState(newState)
      }
    },
    [stateRef]
  )

  return [state, checkSetState] as const
}
