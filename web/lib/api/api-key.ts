import { api } from '../firebase/api'

export const generateNewApiKey = async () => {
  const newApiKey = crypto.randomUUID()

  try {
    await api('update-private-user', { apiKey: newApiKey })
  } catch (e) {
    console.error(e)
    return undefined
  }
  return newApiKey
}
