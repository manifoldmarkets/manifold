import { getFunctions, httpsCallable } from 'firebase/functions'
import { Fold } from '../../../common/fold'
import { User } from '../../../common/user'
import { randomString } from '../../../common/util/random'

const functions = getFunctions()

export const cloudFunction = <RequestData, ResponseData>(name: string) =>
  httpsCallable<RequestData, ResponseData>(functions, name)

export const createContract = cloudFunction('createContract')

export const createFold = cloudFunction<
  { name: string; about: string; tags: string[] },
  { status: 'error' | 'success'; message?: string; fold?: Fold }
>('createFold')

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
