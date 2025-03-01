import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'

export type Command = {
  data: SlashCommandBuilder
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>
}
