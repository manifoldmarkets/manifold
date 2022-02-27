import { useUser } from './use-user'

export const useAdmin = () => {
  const user = useUser()
  const adminIds = [
    'igi2zGXsfxYPgB0DJTXVJVmwCOr2', // Austin
    '5LZ4LgYuySdL1huCWe7bti02ghx2', // James
    'tlmGNz9kjXc2EteizMORes4qvWl2', // Stephen
    'IPTOzEqrpkWmEzh6hwvAyY9PqFb2', // Manifold
  ]
  return adminIds.includes(user?.id || '')
}
