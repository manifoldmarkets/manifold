import { httpsCallable } from 'firebase/functions'
import { Fold } from 'common/fold'
import { Txn } from 'common/txn'
import { User } from 'common/user'
import { randomString } from 'common/util/random'
import './init'
import { functions } from './init'
import { safeLocalStorage } from '../util/local'

export const cloudFunction = <RequestData, ResponseData>(name: string) =>
  httpsCallable<RequestData, ResponseData>(functions, name)

export const createFold = cloudFunction<
  { name: string; about: string; tags: string[] },
  { status: 'error' | 'success'; message?: string; fold?: Fold }
>('createFold')

export const transact = cloudFunction<
  Omit<Txn, 'id' | 'createdTime'>,
  { status: 'error' | 'success'; message?: string; txn?: Txn }
>('transact')

export const sellBet = cloudFunction('sellBet')

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
    value?: number
    contractId: string
    probabilityInt?: number
    resolutions?: { [outcome: string]: number }
  },
  { status: 'error' | 'success'; message?: string }
>('resolveMarket')

export const createUser: () => Promise<User | null> = () => {
  const local = safeLocalStorage()
  let deviceToken = local?.getItem('device-token')
  if (!deviceToken) {
    deviceToken = randomString()
    local?.setItem('device-token', deviceToken)
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
