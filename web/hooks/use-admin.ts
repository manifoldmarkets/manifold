import { isAdmin } from '../../common/envs/constants'
import { usePrivateUser, useUser } from './use-user'

export const useAdmin = () => {
  const user = useUser()
  const privateUser = usePrivateUser(user?.id)
  return isAdmin(privateUser?.email || '')
}
