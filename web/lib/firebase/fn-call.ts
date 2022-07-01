import { httpsCallable } from 'firebase/functions'
import { Txn } from 'common/txn'
import { User } from 'common/user'
import { randomString } from 'common/util/random'
import './init'
import { functions } from './init'
import { safeLocalStorage } from '../util/local'

export const cloudFunction = <RequestData, ResponseData>(name: string) =>
  httpsCallable<RequestData, ResponseData>(functions, name)

export const withdrawLiquidity = cloudFunction<
  { contractId: string },
  { status: 'error' | 'success'; userShares: { [outcome: string]: number } }
>('withdrawLiquidity')

export const transact = cloudFunction<
  Omit<Txn, 'id' | 'createdTime'>,
  { status: 'error' | 'success'; message?: string; txn?: Txn }
>('transact')

export const createAnswer = cloudFunction<
  { contractId: string; text: string; amount: number },
  {
    status: 'error' | 'success'
    message?: string
    answerId?: string
    betId?: string
  }
>('createAnswer')

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

export const claimManalink = cloudFunction<
  string,
  { status: 'error' | 'success'; message?: string }
>('claimManalink')
