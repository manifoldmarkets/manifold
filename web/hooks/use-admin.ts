import { isAdmin } from 'common/envs/constants'
import { usePrivateUser } from './use-user'

export const useAdmin = () => {
  const privateUser = usePrivateUser()
  return isAdmin(privateUser?.email || '')
}
