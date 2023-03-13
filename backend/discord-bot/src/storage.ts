import { createClient } from 'common/supabase/utils'
import { Api } from 'discord-bot/api'
import { config } from 'discord-bot/constants/config'
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  User,
} from 'discord.js'

const discordIdsToApis: { [k: string]: Api } = {}
type DiscordMessageMarketInfo = {
  market_id: string
  market_slug: string
  message_id: string
  thread_id?: string
  channel_id?: string
}
const key = process.env.SUPABASE_KEY
if (!key) throw new Error('No SUPABASE_KEY env var set.')
const supabaseInstanceId = config.supabaseInstanceId
if (!supabaseInstanceId) throw new Error('No supabaseInstanceId in config.')
export const supabase = createClient(supabaseInstanceId, key)
export const messagesHandledViaCollector: Set<string> = new Set()
export const registerHelpMessage = (discordId: string) =>
  `In order to use me click this link: ${config.domain}register-on-discord?discordId=${discordId}.
If you don't have an account yet, you can easily make one at the link!`

export const getUserInfo = async (
  discordUser: User,
  interaction?:
    | ChatInputCommandInteraction
    | ModalSubmitInteraction
    | ButtonInteraction
) => {
  const storedKey = discordIdsToApis[discordUser.id] ?? null
  if (storedKey) return storedKey
  const info = await getApiKeyFromDiscordId(discordUser).catch((e) => {
    if (interaction) {
      interaction.reply({
        content: registerHelpMessage(discordUser.id),
        ephemeral: true,
      })
    } else {
      discordUser.send(registerHelpMessage(discordUser.id))
    }
    throw e
  })
  discordIdsToApis[discordUser.id] = info
  return info
}
export const getApiKeyFromDiscordId = async (discordUser: User) => {
  const { data, error } = await supabase
    .from('discord_users')
    .select('api_key, user_id')
    .eq('discord_user_id', discordUser.id)
  if (error || !data || data.length === 0) {
    if (error) {
      console.error('error on get api key:', error)
      await discordUser.send('Error:' + error.message)
    } else console.log('No api key found for user', discordUser.id)
    throw new Error('No api key found for user: ' + discordUser.id)
  }
  return {
    manifoldUserId: data[0].user_id,
    apiKey: data[0].api_key,
    discordUser: discordUser,
  } as Api
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
  if (error) console.error('write market to message error', error)
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
  if (error) console.error('write thread id to message error', error)
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
  if (error) console.error('write thread id to message error', error)
  return error
}
