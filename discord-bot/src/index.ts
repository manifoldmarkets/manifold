// // For Manifold SDK
// process.env.NODE_ENV = 'production'

import { REST } from '@discordjs/rest'
import * as console from 'console'
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
import * as fs from 'fs'
import * as path from 'path'
import * as process from 'process'
import { fileURLToPath } from 'url'
import { config } from './constants/config.js'
import { getAnyHandledEmojiKey } from './emojis.js'
import { getOpenBinaryMarketFromSlug, handleReaction } from './helpers.js'
import { registerApiKey } from './register-api-key.js'
import { startListener } from './server.js'
import {
  getMarketInfoFromMessageId,
  messagesHandledViaInteraction,
} from './storage.js'

const { id: clientId } = config.client
const token = process.env.DISCORD_BOT_TOKEN
if (!token) throw new Error('No DISCORD_BOT_TOKEN env var set.')
export const commands = new Collection<
  string,
  {
    data: SlashCommandBuilder
    execute: (interaction: ChatInputCommandInteraction) => Promise<any>
  }
>()
const readCommandsFromFiles = async () => {
  // Load commands
  console.log('Loading commands... ')
  const commandsPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'commands'
  )
  const extension = commandsPath.includes('lib') ? '.js' : '.ts'
  console.log('Commands path: ', commandsPath)
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file: string) => file.endsWith(extension))

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file)
    const command = await import(filePath)
    // Set a new item in the Collection
    // With the key as the command name and the value as the exported module
    commands.set(command.data.name, command)
  }
  console.log('Read commands from files')
}
await readCommandsFromFiles()

const rest = new REST({ version: '10' }).setToken(token)

console.log('Logging in... with client id: ', clientId)
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
})
client.once(Events.ClientReady, () => {
  console.log('Ready!')
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const command = commands.get(interaction.commandName)
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

await client.login(token)
console.log('Logged in')

process.stdout.write('Refreshing slash commands... ')
try {
  await rest.put(Routes.applicationCommands(clientId), {
    body: commands.mapValues((c) => c.data.toJSON()),
  })

  console.log(
    `${[...commands.values()].map((x) => '/' + x.data.name).join(', ')}`
  )
} catch (error) {
  console.log('ERROR')
  console.error(error)
}
const handleOldReaction = async (
  pReaction: MessageReaction | PartialMessageReaction,
  pUser: User | PartialUser
) => {
  const ignore = messagesHandledViaInteraction.has(pReaction.message.id)
  console.log(`ignoring reaction:${ignore}`)
  if (ignore) return
  const marketInfo = await getMarketInfoFromMessageId(pReaction.message.id)
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

client.on(Events.MessageReactionAdd, handleOldReaction)

client.on(Events.MessageCreate, async (message) => {
  // Here you check for channel type
  // We only need direct messages here, so skip other messages
  if (!message.channel.isDMBased()) return
  if (message.author.id === client.user?.id) return
  await registerApiKey(message)
})

// If we're running on GCP, start the server to let the cloud function know we're ready
if (process.env.GOOGLE_CLOUD_PROJECT) startListener()
