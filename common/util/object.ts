export const removeUndefinedProps = <T>(obj: T): T => {
  let newObj: any = {}

  for (let key of Object.keys(obj)) {
    if ((obj as any)[key] !== undefined) newObj[key] = (obj as any)[key]
  }

  return newObj
}
