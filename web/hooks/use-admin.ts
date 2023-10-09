import { useUser } from './use-user'
import { isAdminId, isTrustworthy } from 'common/envs/constants'

export const useAdmin = () => {
  const user = useUser()
  return user ? isAdminId(user.id) : false
}

export const useAdminOrTrusted = () => {
  const user = useUser()
  return user ? isAdminId(user.id) || isTrustworthy(user?.username) : false
}

export const useTrusted = () => {
  const user = useUser()
  return user ? isTrustworthy(user?.username) : false
}

export const useDev = () => {
  return process.env.NODE_ENV === 'development'
}
