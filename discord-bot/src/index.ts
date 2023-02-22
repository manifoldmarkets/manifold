// // For Manifold SDK
// process.env.NODE_ENV = 'production'

import { REST } from '@discordjs/rest'
import * as console from 'console'
import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  EmbedBuilder,
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
import {
  getMarketFromSlug,
  getSlug,
  handleReaction,
  sendThreadErrorMessage,
} from './helpers.js'
import { registerApiKey } from './register-api-key.js'
import { startListener } from './server.js'
import { messagesHandledViaInteraction, userApiKey } from './storage.js'

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

client.login(token)
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

  console.log('checking old reaction for proper details')

  const reaction = pReaction.partial ? await pReaction.fetch() : pReaction
  console.log('got reaction emoji id', reaction.emoji.id)
  const message = reaction.message.partial
    ? await reaction.message.fetch()
    : reaction.message

  console.log('got old message id', message.id)
  const emojiKey = getAnyHandledEmojiKey(reaction)
  console.log('got emoji key', emojiKey)
  if (!emojiKey) return

  const user = pUser.partial ? await pUser.fetch() : pUser

  const channel = await client.channels.fetch(message.channelId)
  console.log('got channel', channel?.id)
  if (!channel || !channel.isTextBased()) return

  const marketEmbed = EmbedBuilder.from(message.embeds[0])
  const link = marketEmbed.toJSON().url
  console.log('got link', link)
  if (!link || !link.startsWith('https://manifold.markets/')) return

  const slug = getSlug(link)
  console.log('got slug', slug)
  if (!slug) {
    await sendThreadErrorMessage(
      channel as TextChannel,
      `Slug-not-found-error-${link}`,
      'Could not find market slug in message',
      user as User
    )
    return
  }

  const market = await getMarketFromSlug(slug, (error) =>
    sendThreadErrorMessage(
      channel as TextChannel,
      `Error-${slug}`,
      error,
      user as User
    )
  )
  console.log('got market url', market?.url)
  if (!market) return
  if (!(await userApiKey(user.id)))
    await Promise.all(message.reactions.cache?.map((r) => r.users.fetch()))

  await handleReaction(reaction, user, channel as TextChannel, market)
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
