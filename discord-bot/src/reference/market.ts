import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { FullMarket, LiteMarket, Manifold } from 'manifold-sdk'
import { channelMarkets } from '../common.js'

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

const api = new Manifold()
const marketsCache = {
  // No guarantees about order except that the newest market is always in markets[0]
  markets: [] as LiteMarket[], //     markets: await api.getAllMarkets(),
  updateTime: Date.now(),
}

export async function allMarkets() {
  // cache still valid for 60 seconds
  if (Date.now() - marketsCache.updateTime < 1000 * 60)
    return marketsCache.markets

  const newestInCacheID = marketsCache.markets[0].id
  infloop: for (;;) {
    const newest1000Markets = await api.getMarkets({})
    if (!newest1000Markets.length) {
      marketsCache.updateTime = Date.now()
      return marketsCache.markets
    }

    for (const market of newest1000Markets) {
      if (market.id === newestInCacheID) break infloop
      marketsCache.markets.unshift(market)
    }
  }

  marketsCache.updateTime = Date.now()
  return marketsCache.markets
}

export async function getMarketByTitle(
  query: string,
  options?: { exact: boolean }
) {
  query = query.toLowerCase().trim()
  for (const m of await allMarkets()) {
    if (options?.exact) {
      if (m.question.toLowerCase().trim() === query)
        return api.getMarket({ id: m.id })
    } else {
      if (m.question.toLowerCase().includes(query))
        return api.getMarket({ id: m.id })
    }
  }
  return null
}

export async function getMarketByID(id: string) {
  try {
    return api.getMarket({ id })
  } catch (e) {
    return null
  }
}

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
