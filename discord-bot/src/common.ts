import { User } from 'discord.js'
import { Manifold } from 'manifold-sdk'
import { userIdsToApiKeys } from './storage.js'

export const messagesHandledViaInteraction: Set<string> = new Set()
export const channelMarkets: { [k: string]: string } = {}
export const registerHelpMessage =
  'In order to bet with me go to https://manifold.markets/my-api-key to copy your API key and respond here with it.'
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
