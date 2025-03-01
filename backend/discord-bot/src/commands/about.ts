import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { shouldIgnoreMessageFromGuild } from 'discord-bot/helpers'
import { Command } from 'discord-bot/command'
import { config } from 'discord-bot/constants/config'

const data = new SlashCommandBuilder()
  .setName('about')
  .setDescription('Learn more about the Manifold bot and how to use it.')

async function execute(interaction: ChatInputCommandInteraction) {
  if (shouldIgnoreMessageFromGuild(interaction.guildId)) return
  await interaction.reply({
    content: `${interaction.client.user.toString()} is the official Discord bot of [Manifold](<${
      config.domain
    }>).
     
This bot lets you...
 **/create** - Create a prediction market
 **/search** - Search for pre-made markets
 **/market** - Link to a market and allow discord users to bet via reactions
 **/about** - Learn more about the Manifold bot and how to use it
`,
  })
}

export const aboutCommand = {
  data,
  execute,
} as Command
