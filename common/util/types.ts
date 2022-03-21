export type FirstArgument<T> = T extends (arg1: infer U, ...args: any[]) => any
  ? U
  : any

export type Truthy<T> = Exclude<T, undefined | null | false | 0 | ''>
