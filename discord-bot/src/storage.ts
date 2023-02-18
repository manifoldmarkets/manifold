import { createClient } from '@supabase/supabase-js'
import { config } from './constants/config.js'
import { User } from 'discord.js'
import { Manifold } from 'manifold-sdk'

const discordIdsToApiKeys: { [k: string]: string } = {}

const { supabaseInstanceId } = config
function getInstanceHostname(instanceId: string) {
  return `${instanceId}.supabase.co`
}

function createSupabaseClient() {
  const instanceId = supabaseInstanceId
  if (!instanceId) {
    throw new Error(
      "Can't connect to Supabase; no process.env.SUPABASE_INSTANCE_ID and no instance ID in config."
    )
  }
  const key = process.env.SUPABASE_KEY
  if (!key) {
    throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.")
  }
  const url = `https://${getInstanceHostname(instanceId)}`
  return createClient(url, key)
}

export const supabase = createSupabaseClient()
export const messagesHandledViaInteraction: Set<string> = new Set()
export const channelMarkets: { [k: string]: string } = {}
export const registerHelpMessage =
  'In order to bet with me go to https://manifold.markets/my-api-key to copy your API key and respond here with it.'

export async function getAPIInstance(user: User, errorCallback?: () => void) {
  if (!user?.id || !discordIdsToApiKeys[user.id]) {
    errorCallback?.()
    return null
  }
  const key = discordIdsToApiKeys[user.id]
  return new Manifold(key)
}

export const userApiKey = async (discordUserId: string) => {
  const storedKey = discordIdsToApiKeys[discordUserId] ?? null
  if (storedKey) return storedKey
  const key = await getApiKeyFromDiscordId(discordUserId)
  if (key) discordIdsToApiKeys[discordUserId] = key
  return key
}
export const writeApiKeyToDiscordUserId = async (
  apiKey: string,
  discordUserId: string
) => {
  discordIdsToApiKeys[discordUserId] = apiKey
  const { error } = await supabase
    .from('discord_users')
    .insert({ discord_user_id: discordUserId, api_key: apiKey })
  console.log('write api key error', error)
  return error
}
export const getApiKeyFromDiscordId = async (discordUserId: string) => {
  const { data, error } = await supabase
    .from('discord_users')
    .select('api_key')
    .eq('discord_user_id', discordUserId)
  console.log('got api key for user from supabase', data, error)
  return error ? null : (data[0]?.api_key as string) ?? null
}
