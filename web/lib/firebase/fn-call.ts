import { httpsCallable } from 'firebase/functions'
import { Txn } from 'common/txn'
import { User } from 'common/user'
import { randomString } from 'common/util/random'
import './init'
import { functions } from './init'
import { safeLocalStorage } from '../util/local'

export const cloudFunction = <RequestData, ResponseData>(name: string) =>
  httpsCallable<RequestData, ResponseData>(functions, name)

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
