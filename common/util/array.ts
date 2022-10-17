import { isEqual } from 'lodash'

export function filterDefined<T>(array: (T | null | undefined)[]) {
  return array.filter((item) => item !== null && item !== undefined) as T[]
}

export function buildArray<T>(
  ...params: (T | T[] | false | undefined | null)[]
) {
  const array: T[] = []

  for (const el of params) {
    if (Array.isArray(el)) {
      array.push(...el)
    } else if (el) {
      array.push(el)
    }
  }

  return array
}

export function groupConsecutive<T, U>(xs: T[], key: (x: T) => U) {
  if (!xs.length) {
    return []
  }
  const result = []
  let curr = { key: key(xs[0]), items: [xs[0]] }
  for (const x of xs.slice(1)) {
    const k = key(x)
    if (!isEqual(k, curr.key)) {
      result.push(curr)
      curr = { key: k, items: [x] }
    } else {
      curr.items.push(x)
    }
  }
  result.push(curr)
  return result
}
