import { getFunctions, httpsCallable } from 'firebase/functions'
import { User } from '../../../common/user'
import { randomString } from '../../../common/util/random'

const functions = getFunctions()

export const cloudFunction = (name: string) => httpsCallable(functions, name)

export const createContract = cloudFunction('createContract')

export const placeBet = cloudFunction('placeBet')

export const resolveMarket = cloudFunction('resolveMarket')

export const sellBet = cloudFunction('sellBet')

export const createUser: () => Promise<User | null> = () => {
  let deviceToken = window.localStorage.getItem('device-token')
  if (!deviceToken) {
    deviceToken = randomString()
    window.localStorage.setItem('device-token', deviceToken)
  }

  return cloudFunction('createUser')({ deviceToken })
    .then((r) => (r.data as any)?.user || null)
    .catch(() => null)
}
