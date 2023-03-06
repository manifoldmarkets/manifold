import { createClient } from 'common/supabase/utils'
import { config } from 'discord-bot/constants/config'

const discordIdsToApiKeys: { [k: string]: string } = {}

type DiscordMessageMarketInfo = {
  market_id: string
  market_slug: string
  message_id: string
  thread_id?: string
  channel_id?: string
}
const key = process.env.SUPABASE_KEY
if (!key) throw new Error('No SUPABASE_KEY env var set.')
export const supabase = createClient(config.supabaseInstanceId, key)
export const messagesHandledViaInteraction: Set<string> = new Set()
export const channelMarkets: { [k: string]: string } = {}
export const registerHelpMessage = `In order to bet with me go to ${config.domain}my-api-key to copy your API key and respond here with it.`

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
  return error ? null : (data[0]?.api_key as string) ?? null
}

export const getMarketInfoFromMessageId = async (messageId: string) => {
  const { data, error } = await supabase
    .from('discord_messages_markets')
    .select('*')
    .eq('message_id', messageId)
  return error ? null : (data[0] as DiscordMessageMarketInfo) ?? null
}

export const saveMarketToMessageId = async (
  messageId: string,
  marketId: string,
  marketSlug: string,
  channelId: string
) => {
  const { error } = await supabase.from('discord_messages_markets').insert({
    message_id: messageId,
    market_id: marketId,
    market_slug: marketSlug,
    channel_id: channelId,
  })
  if (error) console.log('write market to message error', error)
  return error
}
export const saveThreadIdToMessageId = async (
  messageId: string,
  threadId: string
) => {
  console.log('writing thread id', threadId, 'to message id', messageId)
  const { error } = await supabase
    .from('discord_messages_markets')
    .update({
      message_id: messageId,
      thread_id: threadId,
      last_updated_thread_time: Date.now(),
    })
    .eq('message_id', messageId)
  if (error) console.log('write thread id to message error', error)
  return error
}
export const updateThreadLastUpdatedTime = async (messageId: string) => {
  const { error } = await supabase
    .from('discord_messages_markets')
    .update({
      message_id: messageId,
      last_updated_thread_time: Date.now(),
    })
    .eq('message_id', messageId)
  if (error) console.log('write thread id to message error', error)
  return error
}
