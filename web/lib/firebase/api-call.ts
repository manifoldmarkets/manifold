import { httpsCallable } from 'firebase/functions'
import { Fold } from '../../../common/fold'
import { User } from '../../../common/user'
import { randomString } from '../../../common/util/random'
import './init'
import { functions } from './init'

export const cloudFunction = <RequestData, ResponseData>(name: string) =>
  httpsCallable<RequestData, ResponseData>(functions, name)

export const createContract = cloudFunction('createContract')

export const createFold = cloudFunction<
  { name: string; about: string; tags: string[] },
  { status: 'error' | 'success'; message?: string; fold?: Fold }
>('createFold')

export const transact = cloudFunction('transact')

export const placeBet = cloudFunction('placeBet')

export const sellBet = cloudFunction('sellBet')

export const sellShares = cloudFunction<
  { contractId: string; shares: number; outcome: 'YES' | 'NO' },
  { status: 'error' | 'success'; message?: string }
>('sellShares')

export const createAnswer = cloudFunction<
  { contractId: string; text: string; amount: number },
  {
    status: 'error' | 'success'
    message?: string
    answerId?: string
    betId?: string
  }
>('createAnswer')

export const resolveMarket = cloudFunction<
  {
    outcome: string
    contractId: string
    probabilityInt?: number
    resolutions?: { [outcome: string]: number }
  },
  { status: 'error' | 'success'; message?: string }
>('resolveMarket')

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

export const changeUserInfo = (data: {
  username?: string
  name?: string
  avatarUrl?: string
}) => {
  return cloudFunction('changeUserInfo')(data)
    .then((r) => r.data as { status: string; message?: string })
    .catch((e) => ({ status: 'error', message: e.message }))
}

export const addLiquidity = (data: { amount: number; contractId: string }) => {
  return cloudFunction('addLiquidity')(data)
    .then((r) => r.data as { status: string })
    .catch((e) => ({ status: 'error', message: e.message }))
}
