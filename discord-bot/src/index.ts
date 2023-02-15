// For Manifold SDK
process.env.NODE_ENV = 'production'

import * as console from 'console'
import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
  Routes,
  SlashCommandBuilder,
} from 'discord.js'
import { REST } from '@discordjs/rest'
import { createRequire } from 'node:module'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'

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
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
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
console.log('OK')

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

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  // When a reaction is received, check if the structure is partial
  if (reaction.partial) {
    // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
    try {
      await reaction.fetch()
    } catch (error) {
      console.error('Something went wrong when fetching the message:', error)
      // Return as `reaction.message.author` may be undefined/null
      return
    }
  }
  // Now the message has been cached and is fully available
  console.log(
    `${reaction.message.author}'s message "${reaction.message.content}" gained a reaction!`
  )
  // The reaction is now also fully available and the properties will be reflected accurately:
  console.log(
    `${reaction.count} user(s) have given the same reaction to this message!`
  )
})
