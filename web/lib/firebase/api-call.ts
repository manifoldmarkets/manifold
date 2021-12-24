import { getFunctions, httpsCallable } from 'firebase/functions'

const functions = getFunctions()

export const cloudFunction = (name: string) => httpsCallable(functions, name)

