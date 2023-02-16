// For Manifold SDK
process.env.NODE_ENV = 'production'

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
import { createRequire } from 'node:module'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { messagesHandledViaInteraction } from './common.js'
import {
  getMarketFromSlug,
  getSlug,
  handleBet,
  sendThreadErrorMessage,
} from './helpers.js'
import { registerApiKey } from './register-api-key.js'

const require = createRequire(import.meta.url)
const Config = require('../config.json')
const clientId = Config.client.id
const token = Config.client.token

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
  console.log('Commands path: ', commandsPath)
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file: string) => file.endsWith('ts'))

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

process.stdout.write('Logging in... ')
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
  pUser: User | PartialUser,
  removal?: boolean
) => {
  const ignore = messagesHandledViaInteraction.has(pReaction.message.id)
  console.log(`ignoring reaction:${ignore}`)
  if (ignore) return

  console.log('handling old reaction')

  const reaction = pReaction.partial ? await pReaction.fetch() : pReaction
  if (!reaction) return

  const user = pUser.partial ? await pUser.fetch() : pUser
  if (!user) return

  const message = reaction.message.partial
    ? await reaction.message.fetch()
    : reaction.message
  if (!message) return
  const { channelId } = message
  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) return
  const { content } = message
  if (!content) return
  const index = content.indexOf('https://manifold.markets/')
  if (index === -1) {
    await sendThreadErrorMessage(
      channel as TextChannel,
      'Link-not-found-error',
      'Could not find market link in message',
      user as User
    )
    return
  }
  const link = content.substring(index).split(')')[0]
  const slug = getSlug(link)
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
  if (!market) return
  await handleBet(
    reaction,
    user,
    channel as TextChannel,
    message,
    market,
    removal,
    true
  )
}

client.on(Events.MessageReactionAdd, handleOldReaction)

// client.on(
//   Events.MessageReactionRemove,
//   (
//     reaction: PartialMessageReaction | MessageReaction,
//     user: User | PartialUser
//   ) => handleOldReaction(reaction, user, true)
// )
// Subscribe to the messages creation event
client.on('messageCreate', async (message) => {
  // Here you check for channel type
  // We only need direct messages here, so skip other messages
  if (!message.channel.isDMBased()) return
  if (message.author.id === client.user?.id) return
  await registerApiKey(message)
})
