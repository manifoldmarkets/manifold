import { updatePrivateUser } from '../firebase/users'

export const generateNewApiKey = async (userId: string) => {
  const newApiKey = crypto.randomUUID()

  return await updatePrivateUser(userId, { apiKey: newApiKey })
    .then(() => newApiKey)
    .catch(() => undefined)
}
