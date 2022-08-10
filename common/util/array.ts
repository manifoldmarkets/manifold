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
