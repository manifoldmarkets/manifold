import { FullMarket } from 'common/api/market-types'
import { ContractMetrics } from 'common/calculate-metrics'
import { sendThreadEmbed } from 'discord-bot/helpers'

import {
  AttachmentBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  hyperlink,
  Message,
  TextChannel,
} from 'discord.js'

export const sendPositionsEmbed = async (
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  market: FullMarket,
  positions: ContractMetrics[],
  message: Message,
  threadId?: string
) => {
  await interaction.deferReply({ ephemeral: true })
  if (!interaction.channel) {
    return await interaction.editReply({
      content: 'This command can only be used in a channel.',
    })
  }

  const { coverImageUrl } = market
  const getAttachment = async (url: string, name: string) => {
    const blob = await fetch(url).then((r) => r.blob())
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return new AttachmentBuilder(buffer, { name })
  }
  const fallbackImage = 'https://manifold.markets/logo-cover.png'

  const cover = await getAttachment(coverImageUrl ?? fallbackImage, 'cover.png')

  const positionsField = positions
    .map((p) => {
      const profit = Math.round(p.profit)
      const prefix = profit > 0 ? 'M' : '-M'
      return `${prefix}${Math.abs(profit)} | ${p.userName} \n`
    })
    .join('')
  const marketEmbed = new EmbedBuilder()
  marketEmbed
    .setColor(0x0099ff)
    .setTitle('Profit & loss leaderboard for ' + market.question)
    .setFields([
      { name: 'Profit | Username', value: positionsField, inline: true },
    ])
    .setURL(market.url)
    .setThumbnail(`attachment://cover.png`)
  const channel = interaction.channel as TextChannel
  const { thread, message: leaderboardMessage } = await sendThreadEmbed(
    channel,
    market,
    marketEmbed,
    message.id,
    [cover],
    threadId
  )
  const linkedMessageContent = hyperlink(
    `the thread`,
    `https://discord.com/channels/${channel.guildId}/${thread.id}/${leaderboardMessage.id}`
  )
  if (interaction.channel.isThread()) {
    return await interaction.deleteReply()
  }
  return await interaction.editReply({
    content: `I sent the leaderboard to the ${linkedMessageContent} for you!`,
    options: { ephemeral: true },
    embeds: [],
  })
}
