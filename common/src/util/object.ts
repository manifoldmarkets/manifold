import { isEqual, mapValues, union } from 'lodash'

export const removeUndefinedProps = <T extends object>(obj: T): T => {
  const newObj: any = {}

  for (const key of Object.keys(obj)) {
    if ((obj as any)[key] !== undefined) newObj[key] = (obj as any)[key]
  }

  return newObj
}
export const removeNullOrUndefinedProps = <T extends object>(
  obj: T,
  exceptions?: string[]
): T => {
  const newObj: any = {}

  for (const key of Object.keys(obj)) {
    if (
      ((obj as any)[key] !== undefined && (obj as any)[key] !== null) ||
      (exceptions ?? []).includes(key)
    )
      newObj[key] = (obj as any)[key]
  }
  return newObj
}

export const addObjects = <T extends { [key: string]: number }>(
  obj1: T,
  obj2: T
) => {
  const keys = union(Object.keys(obj1), Object.keys(obj2))
  const newObj = {} as any

  for (const key of keys) {
    newObj[key] = (obj1[key] ?? 0) + (obj2[key] ?? 0)
  }

  return newObj as T
}

export const subtractObjects = <T extends { [key: string]: number }>(
  obj1: T,
  obj2: T
) => {
  const keys = union(Object.keys(obj1), Object.keys(obj2))
  const newObj = {} as any

  for (const key of keys) {
    newObj[key] = (obj1[key] ?? 0) - (obj2[key] ?? 0)
  }

  return newObj as T
}

export const hasChanges = <T extends object>(obj: T, partial: Partial<T>) => {
  const currValues = mapValues(partial, (_, key: keyof T) => obj[key])
  return !isEqual(currValues, partial)
}

export const hasSignificantDeepChanges = <T extends object>(
  obj: T,
  partial: Partial<T>,
  epsilonForNumbers: number
): boolean => {
  const compareValues = (currValue: any, partialValue: any): boolean => {
    if (typeof currValue === 'number' && typeof partialValue === 'number') {
      return Math.abs(currValue - partialValue) > epsilonForNumbers
    }
    if (typeof currValue === 'object' && typeof partialValue === 'object') {
      return hasSignificantDeepChanges(
        currValue,
        partialValue,
        epsilonForNumbers
      )
    }
    return !isEqual(currValue, partialValue)
  }

  for (const key in partial) {
    if (Object.prototype.hasOwnProperty.call(partial, key)) {
      if (compareValues(obj[key], partial[key])) {
        return true
      }
    }
  }

  return false
}
