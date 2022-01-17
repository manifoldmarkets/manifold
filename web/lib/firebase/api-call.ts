import { getFunctions, httpsCallable } from 'firebase/functions'
import { User } from '../../../common/user'

const functions = getFunctions()

export const cloudFunction = (name: string) => httpsCallable(functions, name)

export const createContract = cloudFunction('createContract')

export const placeBet = cloudFunction('placeBet')

export const resolveMarket = cloudFunction('resolveMarket')

export const sellBet = cloudFunction('sellBet')

export const createUser = () =>
  cloudFunction('createUser')({}).then(
    (r) => (r.data as any)?.user as User | undefined
  )
