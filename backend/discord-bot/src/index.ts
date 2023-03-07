import { REST } from '@discordjs/rest'
import * as console from 'console'
import { commands } from 'discord-bot/commands'

import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageReaction,
  PartialMessageReaction,
  Partials,
  PartialUser,
  Routes,
  SlashCommandBuilder,
  TextChannel,
  User,
} from 'discord.js'
import * as process from 'process'
import { config } from './constants/config.js'
import {
  customEmojiCache,
  customEmojis,
  getAnyHandledEmojiKey,
} from './emojis.js'
import {
  getOpenBinaryMarketFromSlug,
  handleReaction,
  shouldIgnoreMessageFromGuild,
} from './helpers.js'
import { registerApiKey } from './register-api-key.js'
import { startListener } from './server.js'
import {
  getMarketInfoFromMessageId,
  messagesHandledViaInteraction,
} from './storage.js'
const commandsCollection = new Collection<
  string,
  {
    data: SlashCommandBuilder
    execute: (interaction: ChatInputCommandInteraction) => Promise<any>
  }
>()
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
})

const init = async () => {
  const { clientId } = config
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error('No DISCORD_BOT_TOKEN env var set.')

  await Promise.all(
    commands.map(async (c) => commandsCollection.set(c.data.name, c))
  )

  const rest = new REST({ version: '10' }).setToken(token)

  console.log('Logging in... with client id: ', clientId)

  client.once(Events.ClientReady, () => {
    console.log('Client ready for guild', config.guildId)
    // client.emojis.cache.map((e) => console.log(e.name, e.id))
    customEmojis.map((emojiId) => {
      const emoji = client.emojis.cache.get(emojiId)
      if (!emoji) throw new Error(`Emoji not found: ${emojiId} `)
      console.log('Caching emoji:', emojiId, emoji.name)
      customEmojiCache[emojiId] = emoji
    })
  })
  await client.login(token)
  console.log('Logged in')

  console.log('Refreshing slash commands... ')
  try {
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandsCollection.mapValues((c) => c.data.toJSON()),
    })

    console.log(
      'Refreshed command:',
      `${[...commandsCollection.values()]
        .map((x) => '/' + x.data.name)
        .join(', ')}`
    )
  } catch (error) {
    console.log('ERROR')
    console.error(error)
  }
}

const registerListeners = () => {
  client.on(Events.MessageReactionAdd, handleOldReaction)

  client.on(Events.MessageCreate, async (message) => {
    // Here you check for channel type
    // We only need direct messages here, so skip other messages
    if (!message.channel.isDMBased()) return
    if (message.author.id === client.user?.id) return
    await registerApiKey(message)
  })

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return

    const command = commandsCollection.get(interaction.commandName)
    if (!command) return

    try {
      await command.execute(interaction)
    } catch (error) {
      console.error(error)
      await interaction.reply({
        content: 'There was an error while executing this command :(',
        ephemeral: true,
      })
    }
  })
}

init().then(registerListeners)
// If we're running on GCP, start the server to let the cloud function know we're ready
if (process.env.GOOGLE_CLOUD_PROJECT) startListener()

const handleOldReaction = async (
  pReaction: MessageReaction | PartialMessageReaction,
  pUser: User | PartialUser
) => {
  const { message } = pReaction
  const ignore = messagesHandledViaInteraction.has(message.id)
  if (ignore) {
    console.log('ignoring reaction with message id:', message.id)
    return
  }
  const guildId =
    message.guildId === null ? (await message.fetch()).guildId : message.guildId
  if (shouldIgnoreMessageFromGuild(guildId)) return

  const marketInfo = await getMarketInfoFromMessageId(message.id)
  console.log('got market info from supabase', marketInfo)
  if (!marketInfo) return

  console.log('checking old reaction for proper details')

  const reaction = pReaction.partial
    ? await pReaction
        .fetch()
        .then((r) => r)
        .catch((e) => {
          console.log('Failed to fetch reaction', e)
        })
    : pReaction
  if (!reaction) return
  console.log('got reaction emoji id', reaction.emoji.id)
  const emojiKey = getAnyHandledEmojiKey(reaction)
  console.log('got emoji key', emojiKey)
  if (!emojiKey) return

  const user = pUser.partial
    ? await pUser
        .fetch()
        .then((u) => u)
        .catch((e) => {
          console.log('Failed to fetch user', e)
        })
    : pUser
  if (!user) return

  const channelId = marketInfo.channel_id ?? reaction.message.channelId
  const hasCachedChannel = client.channels.cache.has(channelId)
  const channel = hasCachedChannel
    ? client.channels.cache.get(channelId)
    : await client.channels
        .fetch(channelId)
        .then((c) => c)
        .catch((e) => {
          console.log('Failed to fetch channel', e)
        })

  console.log('got channel', channel?.id)
  if (!channel || !channel.isTextBased()) return

  const market = await getOpenBinaryMarketFromSlug(
    marketInfo.market_slug
  ).catch((e) => {
    console.log('Failed to fetch market', e)
  })
  if (!market) return
  console.log('got market', market.url)

  await handleReaction(
    reaction,
    user,
    channel as TextChannel,
    market,
    marketInfo.thread_id
  )
}
