import { FullMarket } from 'common/api-market-types'
import { ContractMetrics } from 'common/calculate-metrics'

import {
  AttachmentBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js'

export const sendPositionsEmbed = async (
  interaction: ChatInputCommandInteraction | ButtonInteraction,
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
    .setTitle('Winners & Losers on ' + market.question)
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
