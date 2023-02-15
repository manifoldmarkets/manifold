import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { FullMarket } from 'manifold-sdk'
import { channelMarkets, getMarketByID, getMarketByTitle } from '../common.js'

export const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Gets info about a market')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription(
        'name of the market; required if not in a channel with a default market'
      )
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString('query')!
  let market: FullMarket | null
  if (!query && interaction.channel && channelMarkets[interaction.channel.id]) {
    await interaction.reply(
      `Getting market info for <#${channelMarkets[interaction.channel.id]}>`
    )
    market = await getMarketByID(channelMarkets[interaction.channel.id])
  } else {
    await interaction.reply(`Searching for ${query}...`)
    market = await getMarketByTitle(query)
  }
  if (!market)
    return interaction.editReply(
      query
        ? `No market matched ${query}`
        : 'No market found for this channel - specify'
    )

  const replies = [
    `Market: ${market.question}`,
    `ID: ${market.id}`,
    `Description: ${(market as any).textDescription.trim()}`,
    `Created by ${market.creatorName}`,
    `Closes at ${new Date(market.closeTime || 0).toLocaleString()}`,
    `URL: <${market.url}>`,
    `Resolution: ${market.isResolved ? market.resolution : 'not resolved'}`,
    // TODO: figure out answers
  ]
  switch (market.outcomeType as string) {
    case 'BINARY':
      replies.push(`Odds: ${(market.probability * 100).toFixed(0)}%`)
      break
    case 'FREE_RESPONSE':
      replies.push(
        `Answers: ${market.answers
          ?.map((a) => `"${a.text}" (${(a.probability * 100).toFixed(0)}%)`)
          .join(', ')}`
      )
      break
    default:
      replies.push(
        `${market.outcomeType} markets, like this one, are not fully supported`
      )
      break
  }

  const channel = interaction.channel?.id
  if (channel) {
    channelMarkets[channel] = market.id
    replies.push(`This market is now the default for <#${channel}>.`)
  }

  return interaction.editReply(replies.join('\n'))
}
