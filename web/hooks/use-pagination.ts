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
  | ActionBase<
      'LOAD',
      { at: number; oldItems: T[]; newItems: T[]; isComplete: boolean }
    >
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
        // always keep the stuff we loaded
        const allItems = action.oldItems.concat(action.newItems)
        const isLoading = false
        const isComplete = action.isComplete
        if (action.at < state.pageEnd) {
          // they aren't looking at the end of the list right now, so don't
          // mess with the page number
          return { ...state, isComplete, isLoading, allItems }
        }
        // bump the page to show the new stuff
        const pageStart = action.at
        const pageEnd = action.at + state.pageSize
        return { ...state, isComplete, isLoading, allItems, pageStart, pageEnd }
      }
      case 'PREV': {
        const pageStart = state.pageStart - state.pageSize
        const pageEnd = state.pageStart
        return { ...state, isLoading: false, pageStart, pageEnd }
      }
      case 'NEXT': {
        // if it's not complete and the next page needs more items, load more
        const shouldLoad =
          !state.isComplete &&
          state.allItems.length < state.pageEnd + state.pageSize
        if (shouldLoad) {
          return { ...state, isLoading: true }
        } else {
          const pageStart = state.pageEnd
          const pageEnd = state.pageEnd + state.pageSize
          return { ...state, isLoading: false, pageStart, pageEnd }
        }
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
    dispatch({
      type: 'INIT',
      opts: { q: opts.q, pageSize: opts.pageSize, preload: opts.preload },
    })
  }, [opts.q, opts.pageSize, opts.preload])

  useEffect(() => {
    if (state.isLoading) {
      const after = state.allItems[state.allItems.length - 1]
      opts.q(state.pageSize, after).then((newItems) => {
        const isComplete = newItems.length < state.pageSize
        dispatch({
          type: 'LOAD',
          at: state.allItems.length,
          oldItems: state.allItems,
          newItems,
          isComplete,
        })
      })
    }
  }, [state.isLoading, opts.q, state.allItems, state.pageSize])

  const items = useMemo(
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
    items,
    getPrev,
    getNext,
    prepend,
  }
}
