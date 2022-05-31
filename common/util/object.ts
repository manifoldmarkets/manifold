import { union } from 'lodash'

type WithoutUndefinedKeys<T> = {
  [P in keyof T]: Exclude<T[P], undefined>
}

export const removeUndefinedProps = <T extends object>(obj: T): WithoutUndefinedKeys<T> => {
  const newObj: Partial<T> = {}

  const keys = Object.keys(obj) as Array<keyof T>
  for (const key of keys) {
    if ((obj as any)[key] !== undefined) newObj[key] = (obj as any)[key]
  }

  return newObj as WithoutUndefinedKeys<T>
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
