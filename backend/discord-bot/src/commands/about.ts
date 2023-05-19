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
    content: `${interaction.client.user.toString()} is the official Discord bot of [Manifold Markets](<${
      config.domain
    }>).
 
Manifold is a play-money prediction market platform where users can create and settle their own questions. Their token exchange system allows the platform to operate in jurisdictions where anti-gambling laws prohibit real money prediction markets. While users can't cash out to themselves, tokens (aka mana) can be bought and donated to charities at a rate of $1:M100. The Manifold team is heavily involved with the EA community, and also has a platform for *Impact Certificates* called [Manifund](<${'https://manifund.org/'}>). 
    
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
