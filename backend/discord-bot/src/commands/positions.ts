import { FullMarket } from 'common/api-market-types'
import { ContractMetrics } from 'common/calculate-metrics'
import { Command } from 'discord-bot/command'
import { config } from 'discord-bot/constants/config'

import {
  getSlug,
  getTopAndBottomPositions,
  shouldIgnoreMessageFromGuild,
} from 'discord-bot/helpers'
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js'

const data = new SlashCommandBuilder()
  .setName('positions')
  .setDescription('Get the best and worst positions for a market')
  .addStringOption((option) =>
    option
      .setName('link')
      .setDescription('The link to the market to get positions for')
      .setRequired(true)
  ) as SlashCommandBuilder

async function execute(interaction: ChatInputCommandInteraction) {
  if (shouldIgnoreMessageFromGuild(interaction.guildId)) return

  const link = interaction.options.getString('link')
  if (!link || !link.startsWith(config.domain)) {
    await interaction.reply(
      `You must specify a market link starting with ${config.domain}`
    )
    return
  }
  const slug = getSlug(link)
  if (!slug) {
    await interaction.reply(
      'Invalid market link, could not find slug from link'
    )
    return
  }
  const { contractMetrics, market } = await getTopAndBottomPositions(
    slug
  ).catch(async (error) => {
    console.log('Failed to get positions', error)
    await interaction.reply({ content: error.message, ephemeral: true })
    return { contractMetrics: [], market: null }
  })
  if (!contractMetrics || !market) return
  await sendPositionsEmbed(interaction, market, contractMetrics)
}

const sendPositionsEmbed = async (
  interaction: ChatInputCommandInteraction,
  market: FullMarket,
  positions: ContractMetrics[]
) => {
  await interaction.deferReply()

  const { coverImageUrl } = market
  const getAttachment = async (url: string, name: string) => {
    const blob = await fetch(url).then((r) => r.blob())
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return new AttachmentBuilder(buffer, { name })
  }
  const fallbackImage = 'https://manifold.markets/logo-cover.png'
  const cover = await getAttachment(coverImageUrl ?? fallbackImage, 'cover.png')
  const usernamesField = positions.map((p) => p.userName + '\n').join('')
  const positionsField = positions
    .map((p) => 'M$' + Math.round(p.profit) + '\n')
    .join('')
  const marketEmbed = new EmbedBuilder()
  marketEmbed
    .setColor(0x0099ff)
    .setTitle('Best and worst positions for ' + market.question)
    .setFields([
      { name: 'User', value: usernamesField, inline: true },
      { name: 'Profit', value: positionsField, inline: true },
    ])
    .setURL(market.url)
    .setThumbnail(`attachment://cover.png`)

  return await interaction.editReply({
    embeds: [marketEmbed],
    files: [cover],
  })
}

export const positionsCommand = {
  data,
  execute,
} as Command
