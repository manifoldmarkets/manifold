import { User } from 'discord.js'
import { Manifold } from 'manifold-sdk'
import { userIdsToApiKeys } from './storage.js'

export const messagesHandledViaInteraction: Set<string> = new Set()
export const channelMarkets: { [k: string]: string } = {}
export const registerHelpMessage =
  'You must first register your Manifold Markets API key with /register. Go to https://manifold.markets/my-api-key to get your API key.'
export async function getAPIInstance(user: User, errorCallback?: () => void) {
  if (!user?.id || !userIdsToApiKeys[user.id]) {
    errorCallback?.()
    return null
  }
  const key = userIdsToApiKeys[user.id]
  return new Manifold(key)
}
export const userApiKey = (userId: string) => {
  return userIdsToApiKeys[userId] ?? null
}
