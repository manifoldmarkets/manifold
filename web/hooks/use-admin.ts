import { useUser } from './use-user'
import { isAdminId } from 'common/envs/constants'

export const useAdmin = () => {
  const user = useUser()
  return user ? isAdminId(user.id) : false
}

export const useDev = () => {
  return process.env.NODE_ENV === 'development'
}
