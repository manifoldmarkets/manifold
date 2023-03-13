import { REST } from '@discordjs/rest'
import * as console from 'console'
import { Command } from 'discord-bot/command'
import { commands } from 'discord-bot/commands'
import { handleCreateMarket } from 'discord-bot/commands/create'
import { handleOldReaction } from 'discord-bot/commands/react-to-bet-on-market'

import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
  Routes,
} from 'discord.js'
import * as process from 'process'
import { config } from './constants/config.js'
import { customEmojiCache, customEmojis } from './emojis.js'
import { handleButtonPress } from './helpers.js'
import { startListener } from './server.js'

const commandsCollection = new Collection<string, Command>()
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
})

const init = async () => {
  const { clientId, guildId } = config
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
    if (guildId) {
      console.log('Refreshing guild specific commands')
      // Guild specific commands
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandsCollection.mapValues((c) => c.data.toJSON()),
      })
    } else {
      // Commands for all guilds (prod)
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandsCollection.mapValues((c) => c.data.toJSON()),
      })
    }

    console.log(
      'Refreshed command:',
      `${[...commandsCollection.values()]
        .map((x) => '/' + x.data.name)
        .join(', ')}`
    )
  } catch (error) {
    console.error('Error on refresh slash commands', error)
  }
}

const registerListeners = () => {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    handleOldReaction(reaction, user, client).catch((e) =>
      console.error('Error handling old reaction', e)
    )
  })

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
      handleButtonPress(interaction).catch((e) =>
        console.error('Error handling button interaction', e)
      )
    } else if (interaction.isModalSubmit()) {
      handleCreateMarket(interaction).catch((e) =>
        console.log('Error handling create market interaction', e)
      )
    } else if (interaction.isChatInputCommand()) {
      if (!interaction.guild) {
        await interaction.reply({
          content: 'This command can only be used in a server',
          ephemeral: true,
        })
        return
      }

      const command = commandsCollection.get(interaction.commandName)
      if (!command) return
      try {
        await command.execute(interaction)
      } catch (e) {
        console.error('Error executing slash command interaction', e)
        interaction
          .reply({
            content: 'There was an error while executing this command :(',
            ephemeral: true,
          })
          .catch((e) =>
            console.error('Error replying to slash command interaction', e)
          )
      }
    }
  })
}

init().then(registerListeners)
// If we're running on GCP, start the server to let the cloud function know we're ready
if (process.env.GOOGLE_CLOUD_PROJECT) startListener()
