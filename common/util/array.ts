export function filterDefined<T>(array: (T | null | undefined)[]) {
  return array.filter((item) => item) as T[]
}
