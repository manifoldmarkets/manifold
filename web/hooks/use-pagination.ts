// A data-source unaware pagination mechanism that is appropriate for paging
// lists of unknown length that we can query from the DB.

import { useCallback, useEffect, useReducer } from 'react'

type DataSource<T> = (limit: number, after?: T) => PromiseLike<T[]>

interface State<T> {
  // items we were given from outside that are always at the front of the list
  prefix: T[]
  // items we have loaded in the list during the course of events
  items: T[]
  // the index of the start of the requested page. may or may not have loaded items
  at: number
  // whether we believe we have loaded all items
  isComplete: boolean
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V

type Action<T> =
  | ActionBase<'PREFIX', { prefix: T[] }>
  | ActionBase<'LOAD', { items: T[]; isComplete: boolean }>
  | ActionBase<'PREV', { distance: number }>
  | ActionBase<'NEXT', { distance: number }>

// whether the pagination should try right now to load some more items,
// i.e. if it's not complete and it doesn't have enough to match desired
function shouldLoadMore<T>(state: State<T>, desired: number) {
  const itemCount = state.prefix.length + state.items.length
  return !state.isComplete && itemCount < state.at + desired
}

function getReducer<T>() {
  return (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case 'PREFIX': {
        return { ...state, prefix: action.prefix }
      }
      case 'LOAD': {
        return { ...state, items: action.items, isComplete: action.isComplete }
      }
      case 'PREV': {
        // it's meaningless to let them page to before the start
        return { ...state, at: Math.max(0, state.at - action.distance) }
      }
      case 'NEXT': {
        // but let them page past the end -- it indicates they want some amount more
        return { ...state, at: state.at + action.distance }
      }
      default:
        throw new Error('Invalid action.')
    }
  }
}

export type PaginationOptions<T> = {
  /** The size of a page (for item fetching purposes in particular.) */
  pageSize: number

  /** Drives item fetching. Must load the next `limit` items after an item.
   *
   * If the pagination asks for N items and the data source returns only M < N,
   * the pagination takes that as an indication that the list is complete.
   */
  q: DataSource<T>

  /** Items which will always be present at the start of the list.
   *
   * Should be used when e.g. the first page is preloaded in static props,
   * or when users can add new items to the front of the list using the UI,
   * or when new items are streamed into the client after initial load.
   */
  prefix?: T[]
}

function getInitialState<T>(opts: PaginationOptions<T>): State<T> {
  return { prefix: opts.prefix ?? [], items: [], at: 0, isComplete: false }
}

export function usePagination<T>(opts: PaginationOptions<T>) {
  const [state, dispatch] = useReducer(getReducer<T>(), opts, getInitialState)

  const loading = shouldLoadMore(state, opts.pageSize)
  const allItems = [...state.prefix, ...state.items]
  const lastItem = allItems[allItems.length - 1]
  const itemCount = allItems.length
  const pageStart = Math.min(state.at, itemCount - opts.pageSize)
  const pageEnd = pageStart + opts.pageSize
  const pageItems = allItems.slice(pageStart, pageEnd)

  useEffect(() => {
    dispatch({ type: 'PREFIX', prefix: opts.prefix ?? [] })
  }, [opts.prefix])

  // note: i guess if q changed we would probably want to wipe existing items,
  // and ignore the results of in-progress queries here? unclear with no example

  useEffect(() => {
    if (loading) {
      opts.q(opts.pageSize, lastItem).then((newItems) => {
        const isComplete = newItems.length < opts.pageSize
        const items = [...state.items, ...newItems]
        dispatch({ type: 'LOAD', items, isComplete })
      })
    }
  }, [loading, lastItem, opts.q, opts.pageSize])

  const getPrev = useCallback(
    () => dispatch({ type: 'PREV', distance: opts.pageSize }),
    [dispatch, opts.pageSize]
  )
  const getNext = useCallback(
    () => dispatch({ type: 'NEXT', distance: opts.pageSize }),
    [dispatch, opts.pageSize]
  )
  const prepend = useCallback(
    (...items: T[]) =>
      dispatch({ type: 'PREFIX', prefix: [...items, ...state.prefix] }),
    [dispatch, state.prefix]
  )

  return {
    items: pageItems,
    pageStart,
    pageEnd,
    pageSize: opts.pageSize,
    isLoading: loading,
    isComplete: state.isComplete,
    isStart: pageStart === 0,
    isEnd: state.isComplete && pageEnd >= itemCount,
    getPrev,
    getNext,
    prepend,
  }
}
