import { useCallback, useEffect, useMemo, useReducer } from 'react'

type ItemFactory<T> = (limit: number, after?: T) => PromiseLike<T[]>

interface State<T> {
  allItems: T[]
  pageStart: number
  pageEnd: number
  pageSize: number
  isLoading: boolean
  isComplete: boolean
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V

type Action<T> =
  | ActionBase<'INIT', { opts: PaginationOptions<T> }>
  | ActionBase<'PREPEND', { items: T[] }>
  | ActionBase<'LOAD', { oldItems: T[]; newItems: T[] }>
  | ActionBase<'PREV'>
  | ActionBase<'NEXT'>

function getReducer<T>() {
  return (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case 'INIT': {
        return getInitialState(action.opts)
      }
      case 'PREPEND': {
        return { ...state, allItems: [...action.items, ...state.allItems] }
      }
      case 'LOAD': {
        const allItems = action.oldItems.concat(action.newItems)
        const isComplete = action.newItems.length < state.pageSize
        return { ...state, allItems, isComplete, isLoading: false }
      }
      case 'PREV': {
        const pageStart = state.pageStart - state.pageSize
        const pageEnd = state.pageStart
        return { ...state, pageStart, pageEnd, isLoading: false }
      }
      case 'NEXT': {
        const pageStart = state.pageEnd
        const pageEnd = state.pageEnd + state.pageSize
        const isLoading = !state.isComplete && state.allItems.length < pageEnd
        return { ...state, pageStart, pageEnd, isLoading }
      }
      default:
        throw new Error('Invalid action.')
    }
  }
}

export type PaginationOptions<T> = {
  q: ItemFactory<T>
  pageSize: number
  preload?: T[]
}

function getInitialState<T>(opts: PaginationOptions<T>): State<T> {
  return {
    allItems: opts.preload ?? [],
    pageStart: 0,
    pageEnd: opts.pageSize,
    pageSize: opts.pageSize,
    isLoading: (opts.preload?.length ?? 0) < opts.pageSize,
    isComplete: false,
  }
}

export function usePagination<T>(opts: PaginationOptions<T>) {
  const [state, dispatch] = useReducer(getReducer<T>(), opts, getInitialState)

  useEffect(() => {
    dispatch({ type: 'INIT', opts: { q: opts.q, pageSize: opts.pageSize } })
  }, [opts.q, opts.pageSize])

  useEffect(() => {
    if (state.isLoading) {
      const after = state.allItems[state.allItems.length - 1]
      opts.q(state.pageSize, after).then((newItems) => {
        dispatch({ type: 'LOAD', oldItems: state.allItems, newItems })
      })
    }
  }, [state.isLoading, opts.q, state.allItems, state.pageSize])

  const pageItems = useMemo(
    () => state.allItems.slice(state.pageStart, state.pageEnd),
    [state.allItems, state.pageStart, state.pageEnd]
  )

  const getPrev = useCallback(() => dispatch({ type: 'PREV' }), [dispatch])
  const getNext = useCallback(() => dispatch({ type: 'NEXT' }), [dispatch])
  const prepend = useCallback(
    (...items: T[]) => dispatch({ type: 'PREPEND', items }),
    [dispatch]
  )

  return {
    ...state,
    isStart: state.pageStart === 0,
    isEnd: state.isComplete && state.pageEnd >= state.allItems.length,
    pageItems,
    getPrev,
    getNext,
    prepend,
  }
}
