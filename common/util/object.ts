import { isEqual, mapValues, union } from 'lodash'

export const removeUndefinedProps = <T extends object>(obj: T): T => {
  const newObj: any = {}

  for (const key of Object.keys(obj)) {
    if ((obj as any)[key] !== undefined) newObj[key] = (obj as any)[key]
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
