// adapted from https://github.com/premshree/use-pagination-firestore

import { useEffect, useReducer } from 'react'
import {
  Query,
  QuerySnapshot,
  QueryDocumentSnapshot,
  queryEqual,
  limit,
  onSnapshot,
  query,
  startAfter,
} from 'firebase/firestore'

interface State<T> {
  baseQ: Query<T>
  docs: QueryDocumentSnapshot<T>[]
  pageStart: number
  pageEnd: number
  pageSize: number
  isLoading: boolean
  isComplete: boolean
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V

type Action<T> =
  | ActionBase<'INIT', { opts: PaginationOptions<T> }>
  | ActionBase<'LOAD', { snapshot: QuerySnapshot<T> }>
  | ActionBase<'PREV'>
  | ActionBase<'NEXT'>

const getReducer =
  <T>() =>
  (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case 'INIT': {
        return getInitialState(action.opts)
      }
      case 'LOAD': {
        const docs = state.docs.concat(action.snapshot.docs)
        const isComplete = action.snapshot.docs.length < state.pageSize
        return { ...state, docs, isComplete, isLoading: false }
      }
      case 'PREV': {
        const { pageStart, pageSize } = state
        const prevStart = pageStart - pageSize
        const isLoading = false
        return { ...state, isLoading, pageStart: prevStart, pageEnd: pageStart }
      }
      case 'NEXT': {
        const { docs, pageEnd, isComplete, pageSize } = state
        const nextEnd = pageEnd + pageSize
        const isLoading = !isComplete && docs.length < nextEnd
        return { ...state, isLoading, pageStart: pageEnd, pageEnd: nextEnd }
      }
      default:
        throw new Error('Invalid action.')
    }
  }

export type PaginationOptions<T> = { q: Query<T>; pageSize: number }

const getInitialState = <T>(opts: PaginationOptions<T>): State<T> => {
  return {
    baseQ: opts.q,
    docs: [],
    pageStart: 0,
    pageEnd: opts.pageSize,
    pageSize: opts.pageSize,
    isLoading: true,
    isComplete: false,
  }
}

export const usePagination = <T>(opts: PaginationOptions<T>) => {
  const [state, dispatch] = useReducer(getReducer<T>(), opts, getInitialState)

  useEffect(() => {
    // save callers the effort of ref-izing their opts by checking for
    // deep equality over here
    if (queryEqual(opts.q, state.baseQ) && opts.pageSize === state.pageSize) {
      return
    }
    dispatch({ type: 'INIT', opts })
  }, [opts, state.baseQ, state.pageSize])

  useEffect(() => {
    if (state.isLoading) {
      const lastDoc = state.docs[state.docs.length - 1]
      const nextQ = lastDoc
        ? query(state.baseQ, startAfter(lastDoc), limit(state.pageSize))
        : query(state.baseQ, limit(state.pageSize))
      return onSnapshot(
        nextQ,
        (snapshot) => {
          dispatch({ type: 'LOAD', snapshot })
        },
        (error) => {
          console.error('error', error)
        }
      )
    }
  }, [state.isLoading, state.baseQ, state.docs, state.pageSize])

  return {
    isLoading: state.isLoading,
    isStart: state.pageStart === 0,
    isEnd: state.isComplete && state.pageEnd >= state.docs.length,
    getPrev: () => dispatch({ type: 'PREV' }),
    getNext: () => dispatch({ type: 'NEXT' }),
    allItems: () => state.docs.map((d) => d.data()),
    getItems: () =>
      state.docs.slice(state.pageStart, state.pageEnd).map((d) => d.data()),
  }
}
