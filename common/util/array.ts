export function filterDefined<T>(array: (T | null | undefined)[]) {
  return array.filter((item) => item !== null && item !== undefined) as T[]
}
